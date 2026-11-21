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

/**
 * The owner key of a snapshot entry that is no ledger entry: a path outside the ledger the commit
 * takes while its content is the recorded one (an agent attempt's declared path, D15). The ledger
 * prune never touches it.
 */
export const DECLARED_SNAPSHOT_OWNER = 'declared';

/** One ledger entry the commit was judged on, or a declared path ({@link DECLARED_SNAPSHOT_OWNER}). */
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
      (entry.owner !== DECLARED_SNAPSHOT_OWNER && ledgerOwnerOfKey(entry.owner) === undefined) ||
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
  /**
   * `Nevo-*` trailers of the Engine's own message (an attempt commit's), added to the manual
   * commit's; absent for a person's message.
   */
  readonly trailers?: Readonly<Record<string, string>>;
}

const TRAILER_KEY = /^Nevo-[A-Za-z]+$/u;
const TRAILERS_MAX = 10;

export function encodeMessage(message: StoredMessage): EncodedPayload {
  return encoded(
    JSON.stringify({
      subject: message.subject,
      body: message.body,
      ...(message.trailers !== undefined ? { trailers: message.trailers } : {}),
    }),
  );
}

function isTrailers(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);

  return (
    entries.length <= TRAILERS_MAX &&
    entries.every(
      ([key, text]) =>
        TRAILER_KEY.test(key) && typeof text === 'string' && text.length > 0 && text.length <= 200,
    )
  );
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
    !exactKeys(value, ['subject', 'body', 'trailers'], ['trailers']) ||
    typeof value.subject !== 'string' ||
    value.subject.length === 0 ||
    typeof value.body !== 'string' ||
    (value.trailers !== undefined && !isTrailers(value.trailers))
  ) {
    throw unprovable();
  }

  return {
    subject: value.subject,
    body: value.body,
    ...(value.trailers !== undefined ? { trailers: value.trailers } : {}),
  };
}
