import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

import { syncDirectoryWhenSupported } from '../../project/fs/atomic-json';
import { removeFileWindowsSafe, renameWindowsSafe } from '../../project/fs/windows-safe-fs';

import type { SpecFlowEngine } from '../../application';
import { parseSpecificationManifestText } from '../model';
import type { SpecificationScaffoldFile } from '../scaffold';
import { CreateOperationError, type CreateJournal } from './journal';
import { readCreatePayload } from './journal/payload';

/**
 * The scaffold of a journal, read from the verified payload store and NEVER regenerated from the
 * current code, templates or catalogue. Durable scaffold contents are immutable until the operation
 * completes. A missing or mismatching payload file is `CREATE_RECOVERY_REQUIRED`.
 */
export async function expectedScaffold(
  engine: Pick<SpecFlowEngine, 'context'>,
  record: CreateJournal,
): Promise<readonly SpecificationScaffoldFile[]> {
  const files: SpecificationScaffoldFile[] = [];
  for (const file of record.files) {
    files.push({
      relativePath: file.relativePath,
      content: await readCreatePayload(engine.context, record.operationId, file),
      sha256: file.sha256,
      bytes: file.bytes,
    });
  }
  // The registry the manifest carries must be the one the journal answers with.
  const manifest = files[0]!;
  let documentIds: string[];
  try {
    documentIds = parseSpecificationManifestText(
      manifest.content,
      record.slug,
      'active',
    ).documents.map((document) => document.id);
  } catch {
    throw recovery('Scaffold manifest in the payload is not a valid manifest.');
  }
  if (
    documentIds.length !== record.documentIds.length ||
    !documentIds.every((id, index) => id === record.documentIds[index])
  ) {
    throw recovery('Scaffold registry differs from the recorded creation intent.');
  }
  return files;
}

export async function writeScaffoldWithEvidence(
  engine: Pick<SpecFlowEngine, 'context'>,
  record: CreateJournal,
  /** Internal test seam: the staged file of the manifest is open but not yet written. */
  afterManifestOpened?: () => Promise<void>,
  /** Internal test seam: called after each file has been published (index in the journal list). */
  afterFile?: (index: number) => Promise<void>,
): Promise<void> {
  const files = await expectedScaffold(engine, record);
  const root = record.target.workspaceRoot;
  const specDirectory = join(root, 'specs/active', record.slug);
  for (const [index, file] of files.entries()) {
    const absolute = join(root, file.relativePath);
    // Defence in depth: the codec validated the path, the writer proves the resolved location.
    const inside = relative(specDirectory, absolute);
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
      throw recovery('Scaffold path escapes the Specification directory.');
    }
    // No symlink or path redirection may alter the target after validation. Every directory from
    // `specs` down to the file's parent is created (or verified) one segment at a time.
    for (const directory of directoriesOf(root, file.relativePath)) {
      try {
        await mkdir(directory);
      } catch (error) {
        if (!isExists(error)) throw error;
      }
      const stat = await lstat(directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (await realpath(directory)) !== directory
      ) {
        throw recovery('Specification directory has been redirected.');
      }
    }
    await publishFile(
      absolute,
      file.content,
      file.relativePath.endsWith('/specification.yaml') ? afterManifestOpened : undefined,
    );
    await verifyFile(absolute, file.sha256);
    await afterFile?.(index);
  }
}

/**
 * A file becomes visible only complete: it is written to a staged file, fsynced and renamed, so a
 * SIGKILL never leaves a partial scaffold file. A file that already exists is accepted when it is
 * identical, and replaced atomically when it is a byte-prefix (including empty) of the pinned
 * content (what an earlier interrupted write could leave); anything else is a recovery.
 *
 * The staged name is short and independent of the document name (`.<uuid>.tmp`), so a segment that
 * passed the segment cap can never make the staged file exceed the file name limit. After the
 * rename the parent directory is fsynced (best effort, not on Windows) so the new name survives a
 * power loss; the file content itself was fsynced before.
 */
async function publishFile(
  absolute: string,
  content: string,
  afterStaged: (() => Promise<void>) | undefined,
): Promise<void> {
  const directory = dirname(absolute);
  await removeStaleStagedFiles(directory);
  const expected = Buffer.from(content, 'utf8');
  let existing: Buffer | undefined;
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw recovery('Scaffold file was redirected.');
    // Larger than the pinned content can neither be equal nor a prefix: decide without reading it.
    if (stat.size > expected.length) {
      throw recovery('Scaffold was modified since the recorded creation intent.');
    }
    existing = await readFile(absolute);
  } catch (error) {
    if (error instanceof CreateOperationError) throw error;
    if (!isMissing(error)) throw recovery('Scaffold evidence is missing or unreadable.');
  }
  if (existing !== undefined) {
    if (existing.equals(expected)) return;
    if (
      existing.length > expected.length ||
      !expected.subarray(0, existing.length).equals(existing)
    ) {
      throw recovery('Scaffold was modified since the recorded creation intent.');
    }
  }
  const staged = join(directory, `.${randomUUID()}.tmp`);
  const handle = await open(staged, 'wx', 0o600);
  try {
    await afterStaged?.();
    await handle.writeFile(expected);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await renameWindowsSafe(staged, absolute);
  if (process.platform !== 'win32')
    await syncDirectoryWhenSupported(directory).catch(() => undefined);
}

const STAGED_FILE = /^\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u;

/** Staged files of an interrupted write in this directory; never content, always safe to drop. */
async function removeStaleStagedFiles(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && STAGED_FILE.test(entry.name)) {
      await removeFileWindowsSafe(join(directory, entry.name)).catch(() => undefined);
    }
  }
}

export async function verifyScaffold(
  engine: Pick<SpecFlowEngine, 'context'>,
  record: CreateJournal,
): Promise<void> {
  await expectedScaffold(engine, record);
  for (const file of record.files) {
    await verifyFile(join(record.target.workspaceRoot, file.relativePath), file.sha256);
  }
}

/** Directories to create or verify, outermost first: `<root>/specs`, then each segment of the parent. */
function directoriesOf(root: string, relativePath: string): string[] {
  const segments = dirname(relativePath).split('/');
  const directories: string[] = [];
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    directories.push(current);
  }
  return directories;
}

async function verifyFile(path: string, expectedHash: string): Promise<void> {
  let content: string;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw recovery('Scaffold file was redirected.');
    content = await readFile(path, 'utf8');
  } catch {
    throw recovery('Scaffold evidence is missing or unreadable.');
  }
  if (sha256(content) !== expectedHash) {
    throw recovery('Scaffold was modified since the recorded creation intent.');
  }
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function recovery(message: string): CreateOperationError {
  return new CreateOperationError('CREATE_RECOVERY_REQUIRED', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}
