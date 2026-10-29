import {
  LEDGER_MAX_OPERATION_IDS,
  LEDGER_MAX_PATHS,
  LEDGER_VERSION,
  LedgerLimitError,
  type LedgerEntry,
  type LedgerOwner,
  type LedgerReason,
  type LedgerRecord,
} from './model';

/** The post-image of one path an operation leaves uncommitted. */
export interface LedgerPathChange {
  readonly path: string;
  /** sha256 of the content on disk after the operation; `null` for a removed file. */
  readonly postSha256: string | null;
}

/** What an operation records: its id, why, when, and the paths it changed. */
export interface LedgerUpsert {
  readonly operationId: string;
  readonly reason: LedgerReason;
  readonly recordedAt: string;
  readonly paths: readonly LedgerPathChange[];
  /** Pinned by the first entry of an empty record; ignored when the record already has entries. */
  readonly branch: string | null;
  readonly head: string | null;
}

/** Where a record lives; the identity a new record is created with. */
export interface LedgerSubject {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly owner: LedgerOwner;
}

function sortedByPath(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

/**
 * The record after an operation recorded its paths. Pure and idempotent by operation id: a path whose
 * entry already lists the operation is left as it is, so a re-run after a stop adds nothing twice.
 * Updating a path replaces its post-image and appends the id (the newest 50 are kept, the count is
 * the true number); an entry exists exactly once per path. A write that would add a distinct path
 * beyond {@link LEDGER_MAX_PATHS} throws {@link LedgerLimitError} and changes nothing.
 * Returns the same object when nothing changed.
 */
export function applyLedgerUpsert(
  record: LedgerRecord | undefined,
  subject: LedgerSubject,
  upsert: LedgerUpsert,
): LedgerRecord {
  const entries = new Map((record?.entries ?? []).map((entry) => [entry.path, entry]));
  const fresh = upsert.paths.filter(
    (change, index) =>
      !entries.has(change.path) &&
      upsert.paths.findIndex((other) => other.path === change.path) === index,
  );
  if (entries.size + fresh.length > LEDGER_MAX_PATHS) {
    throw new LedgerLimitError();
  }

  let changed = false;
  for (const change of upsert.paths) {
    const known = entries.get(change.path);
    if (known?.operationIds.includes(upsert.operationId) === true) {
      continue;
    }

    changed = true;
    entries.set(change.path, {
      path: change.path,
      postSha256: change.postSha256,
      operationIds: [...(known?.operationIds ?? []), upsert.operationId].slice(
        -LEDGER_MAX_OPERATION_IDS,
      ),
      operationCount: (known?.operationCount ?? 0) + 1,
      recordedAt: upsert.recordedAt,
      reason: upsert.reason,
    });
  }

  if (!changed && record !== undefined) {
    return record;
  }

  const empty = record === undefined || record.entries.length === 0;

  return {
    version: LEDGER_VERSION,
    projectId: subject.projectId,
    workspaceId: subject.workspaceId,
    workspaceRoot: subject.workspaceRoot,
    owner: subject.owner,
    branch: empty ? upsert.branch : record.branch,
    head: empty ? upsert.head : record.head,
    createdAt: record?.createdAt ?? upsert.recordedAt,
    updatedAt: upsert.recordedAt,
    entries: sortedByPath([...entries.values()]),
  };
}

/** The record without the entries of `paths` (the ones a commit now holds); the same object when none matched. */
export function removeLedgerPaths(
  record: LedgerRecord,
  paths: ReadonlySet<string>,
  updatedAt: string,
): LedgerRecord {
  const kept = record.entries.filter((entry) => !paths.has(entry.path));
  if (kept.length === record.entries.length) {
    return record;
  }

  return { ...record, updatedAt, entries: kept };
}
