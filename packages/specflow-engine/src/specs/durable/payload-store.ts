import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { syncDirectoryWhenSupported } from '../../project/fs/atomic-json';
import type { ResolvedProjectHome } from '../../project/home/home';
import { readFileWindowsSafe, renameWindowsSafe } from '../../project/fs/windows-safe-fs';
import { sha256Hex } from '../../hash';
import {
  OPERATION_ID_PATTERN,
  journalDirectory,
  validateJournalOperationId,
  type JournalKindBase,
} from './journal-store';

/**
 * Hash-addressed payload store of a durable operation: every file is written ONCE, before the
 * journal is published, to `<journal directory>/<operationId>.payload/<sha256>` (temp file, fsync,
 * rename). The directory name does not end in `.json`, so journal readers never see it. The journal
 * keeps only evidence (path, sha256, bytes); recovery reads the content from here and verifies it,
 * so a catalogue or template change after the crash has no effect.
 */
export const PAYLOAD_DIRECTORY_SUFFIX = '.payload';

const SHA256 = /^[0-9a-f]{64}$/u;
/** `<operation id>.payload`: the id part is the shared operation id pattern, captured. */
const PAYLOAD_DIRECTORY_NAME = new RegExp(
  `^(${OPERATION_ID_PATTERN.source.slice(1, -1)})${PAYLOAD_DIRECTORY_SUFFIX.replace('.', '\\.')}$`,
  OPERATION_ID_PATTERN.flags,
);

export interface PayloadContent {
  readonly sha256: string;
  readonly content: string;
}

/** The recorded evidence of one payload file. */
export interface PayloadEvidence {
  readonly sha256: string;
  readonly bytes: number;
}

/** The operation id of a payload directory name, or `undefined` when the name is not one. */
export function payloadOperationIdOf(directoryName: string): string | undefined {
  return PAYLOAD_DIRECTORY_NAME.exec(directoryName)?.[1];
}

export function payloadDirectory(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): string {
  validateJournalOperationId(kind, operationId);

  return join(journalDirectory(context, kind), operationId + PAYLOAD_DIRECTORY_SUFFIX);
}

/**
 * Writes every payload file durably. Caller MUST hold the Project Home control lock, and the
 * journal MUST be published only after this returns. Idempotent: an existing file with the right
 * content is kept. A directory left by an earlier crash of the same operation id is replaced.
 */
export async function writePayload(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
  files: readonly PayloadContent[],
): Promise<void> {
  const directory = payloadDirectory(context, kind, operationId);
  await removePayload(context, kind, operationId);
  await mkdir(directory, { mode: 0o700 });
  const written = new Set<string>();
  for (const file of files) {
    if (written.has(file.sha256)) {
      continue;
    }

    written.add(file.sha256);
    if (!SHA256.test(file.sha256) || sha256Hex(file.content) !== file.sha256) {
      throw new Error(`${kind.label} payload content does not match its hash.`);
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
 * is the kind's `payloadUnprovable` error: the content cannot be proven, so nothing is regenerated.
 */
export async function readPayload(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
  file: PayloadEvidence,
): Promise<string> {
  const path = join(payloadDirectory(context, kind, operationId), file.sha256);
  let content: string;
  try {
    if (!SHA256.test(file.sha256)) {
      throw new Error('hash');
    }

    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes) {
      throw new Error('shape');
    }

    content = await readFileWindowsSafe(path);
  } catch {
    throw kind.errors.payloadUnprovable(`${kind.label} payload is missing or unreadable.`);
  }

  if (Buffer.byteLength(content, 'utf8') !== file.bytes || sha256Hex(content) !== file.sha256) {
    throw kind.errors.payloadUnprovable(
      `${kind.label} payload does not match the recorded evidence.`,
    );
  }

  return content;
}

/** Removes the payload directory of an operation; absent is fine. Best effort for retention. */
export async function removePayload(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
): Promise<void> {
  await rm(payloadDirectory(context, kind, operationId), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 50,
  });
}

/**
 * Removes every file of an operation's payload directory except the ones whose names (hashes) are in
 * `keep`, stage files included. Used when part of the payload is no longer needed (a document writer needs the
 * content only until its files are in place and keeps the plan file). Absent directory is fine.
 */
export async function removePayloadFilesExcept(
  context: ResolvedProjectHome,
  kind: JournalKindBase,
  operationId: string,
  keep: readonly string[],
): Promise<void> {
  const directory = payloadDirectory(context, kind, operationId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  const kept = new Set(keep);
  for (const name of names) {
    if (kept.has(name)) {
      continue;
    }

    await rm(join(directory, name), { force: true, maxRetries: 3, retryDelay: 50 });
  }

  await syncDirectoryWhenSupported(directory);
}
