import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
  /** Internal test seam: a real manifest handle is open but not yet written. */
  afterManifestOpened?: () => Promise<void>,
): Promise<void> {
  const files = await expectedScaffold(engine, record);
  const root = record.target.workspaceRoot;
  for (const file of files) {
    const absolute = join(root, file.relativePath);
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
    try {
      const handle = await open(absolute, 'wx', 0o600);
      try {
        if (file.relativePath.endsWith('/specification.yaml')) {
          await afterManifestOpened?.();
        }
        await handle.writeFile(file.content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (!isExists(error)) throw error;
    }
    await verifyFile(absolute, file.sha256);
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

function isExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}
