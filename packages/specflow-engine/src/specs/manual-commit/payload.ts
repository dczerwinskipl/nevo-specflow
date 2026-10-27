/**
 * The two payload files of a manual commit, both written once before the journal is published:
 * the ledger entries the commit was judged on (so a recovery proves against the same post-images
 * whatever the ledger says later) and the person's message. Pure encoders and strict decoders.
 */
import { sha256Hex } from '../../hash';
import { exactKeys, isCount, isRecord } from '../durable/guards';
import { ledgerOwnerOfKey } from '../durable/ledger/model';
import { manualCommitError } from './errors';
import { MANUAL_COMMIT_MAX_OWNERS, MANUAL_COMMIT_MAX_PATHS } from './model';

/** One ledger entry the commit was judged on. */
export interface SnapshotEntry {
  readonly owner: string;
  readonly path: string;
  /** sha256 of the content the Engine left on disk; `null` for a removed file. */
  readonly postSha256: string | null;
  /** How many operations changed the path when it was judged: the guard of the later prune. */
  readonly operationCount: number;
}

export interface EncodedPayload {
  readonly text: string;
  readonly sha256: string;
  readonly bytes: number;
}

const SNAPSHOT_VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/u;

function encoded(text: string): EncodedPayload {
  return { text, sha256: sha256Hex(text), bytes: Buffer.byteLength(text, 'utf8') };
}

/** The snapshot of the selected entries: sorted by path, one entry per path. */
export function encodeSnapshot(entries: readonly SnapshotEntry[]): EncodedPayload & {
  readonly pathCount: number;
} {
  const sorted = [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const payload = encoded(
    JSON.stringify({
      version: SNAPSHOT_VERSION,
      entries: sorted.map((entry) => ({
        owner: entry.owner,
        path: entry.path,
        postSha256: entry.postSha256,
        operationCount: entry.operationCount,
      })),
    }),
  );
  return { ...payload, pathCount: sorted.length };
}

function unprovable(): Error {
  return manualCommitError('payload-unprovable', 'The manual commit snapshot is not provable.');
}

/** The entries of a snapshot payload; anything that is not one this Engine wrote is `payload-unprovable`. */
export function decodeSnapshot(text: string): SnapshotEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unprovable();
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ['version', 'entries']) ||
    value.version !== SNAPSHOT_VERSION ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > MANUAL_COMMIT_MAX_PATHS * MANUAL_COMMIT_MAX_OWNERS
  ) {
    throw unprovable();
  }
  const seen = new Set<string>();
  return value.entries.map((entry: unknown) => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['owner', 'path', 'postSha256', 'operationCount']) ||
      typeof entry.owner !== 'string' ||
      ledgerOwnerOfKey(entry.owner) === undefined ||
      typeof entry.path !== 'string' ||
      entry.path.length === 0 ||
      entry.path.length > 1024 ||
      seen.has(entry.path) ||
      !(
        entry.postSha256 === null ||
        (typeof entry.postSha256 === 'string' && SHA256.test(entry.postSha256))
      ) ||
      !isCount(entry.operationCount, Number.MAX_SAFE_INTEGER)
    ) {
      throw unprovable();
    }
    seen.add(entry.path);
    return {
      owner: entry.owner,
      path: entry.path,
      postSha256: entry.postSha256,
      operationCount: entry.operationCount,
    };
  });
}

export interface StoredMessage {
  readonly subject: string;
  readonly body: string;
}

export function encodeMessage(message: StoredMessage): EncodedPayload {
  return encoded(JSON.stringify({ subject: message.subject, body: message.body }));
}

export function decodeMessage(text: string): StoredMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unprovable();
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ['subject', 'body']) ||
    typeof value.subject !== 'string' ||
    value.subject.length === 0 ||
    typeof value.body !== 'string'
  ) {
    throw unprovable();
  }
  return { subject: value.subject, body: value.body };
}
