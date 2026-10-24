import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { syncDirectoryWhenSupported } from '../../../project/fs/atomic-json';
import type { ResolvedProjectHome } from '../../../project/home/home';
import { readFileWindowsSafe, renameWindowsSafe } from '../../../project/fs/windows-safe-fs';
import { CreateOperationError } from '../error';
import { sha256Utf8 } from '../intent';
import type { CreateJournalFile } from './model';
import { CREATE_JOURNAL_RELATIVE_DIR, validateOperationId } from './store';

/**
 * Hash-addressed payload store of a Create: every scaffold file is written ONCE, before the journal
 * is published, to `<operations>/create/<operationId>.payload/<sha256>` (temp file, fsync, rename).
 * The directory name does not end in `.json`, so journal readers never see it. The journal keeps only
 * evidence (path, sha256, bytes); recovery and the scaffold writer read the content from here and
 * verify it, so a catalogue or template change after the crash has no effect.
 */
export const PAYLOAD_DIRECTORY_SUFFIX = '.payload';

const SHA256 = /^[0-9a-f]{64}$/u;
const PAYLOAD_DIRECTORY_NAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.payload$/iu;

export interface PayloadContent {
  readonly sha256: string;
  readonly content: string;
}

/** The operation id of a payload directory name, or `undefined` when the name is not one. */
export function payloadOperationIdOf(directoryName: string): string | undefined {
  return PAYLOAD_DIRECTORY_NAME.exec(directoryName)?.[1];
}

export function createPayloadDirectory(context: ResolvedProjectHome, operationId: string): string {
  validateOperationId(operationId);
  return join(
    context.project.stateRoot,
    CREATE_JOURNAL_RELATIVE_DIR,
    operationId + PAYLOAD_DIRECTORY_SUFFIX,
  );
}

/**
 * Writes every payload file durably. Caller MUST hold the Project Home control lock, and the
 * journal MUST be published only after this returns. Idempotent: an existing file with the right
 * content is kept. A directory left by an earlier crash of the same operation id is replaced.
 */
export async function writeCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
  files: readonly PayloadContent[],
): Promise<void> {
  const directory = createPayloadDirectory(context, operationId);
  await removeCreatePayload(context, operationId);
  await mkdir(directory, { mode: 0o700 });
  const written = new Set<string>();
  for (const file of files) {
    if (written.has(file.sha256)) continue;
    written.add(file.sha256);
    if (!SHA256.test(file.sha256) || sha256Utf8(file.content) !== file.sha256) {
      throw new Error('Create payload content does not match its hash.');
    }
    const path = join(directory, file.sha256);
    const staged = join(directory, `.${file.sha256}.${randomUUID()}.tmp`);
    const handle = await open(staged, 'wx', 0o600);
    try {
      await handle.writeFile(file.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWindowsSafe(staged, path);
  }
  await syncDirectoryWhenSupported(directory);
}

/**
 * The verified content of one journal file. A missing, redirected, truncated or modified payload
 * is `CREATE_RECOVERY_REQUIRED`: the scaffold cannot be proven, so nothing is regenerated.
 */
export async function readCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
  file: CreateJournalFile,
): Promise<string> {
  const path = join(createPayloadDirectory(context, operationId), file.sha256);
  let content: string;
  try {
    if (!SHA256.test(file.sha256)) throw new Error('hash');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes)
      throw new Error('shape');
    content = await readFileWindowsSafe(path);
  } catch {
    throw payloadError('Create payload is missing or unreadable.');
  }
  if (Buffer.byteLength(content, 'utf8') !== file.bytes || sha256Utf8(content) !== file.sha256) {
    throw payloadError('Create payload does not match the recorded evidence.');
  }
  return content;
}

/** Removes the payload directory of an operation; absent is fine. Best effort for retention. */
export async function removeCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<void> {
  await rm(createPayloadDirectory(context, operationId), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 50,
  });
}

function payloadError(message: string): CreateOperationError {
  return new CreateOperationError('CREATE_RECOVERY_REQUIRED', message);
}
