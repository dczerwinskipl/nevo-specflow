import type { ResolvedProjectHome } from '../../../project/home/home';
import { type LedgerOwner, type LedgerRecord } from './model';
import { readLedgerRecord, withLedgerLock, writeLedgerRecord } from './store';
import { removeLedgerPaths } from './upsert';

/**
 * Which of `paths` already hold, in the working tree, exactly what `HEAD` holds (a removed file equals
 * an absent blob). Read-only; supplied by the caller that knows Git, so the ledger knows none.
 */
export type LedgerHeadProbe = (
  workspaceRoot: string,
  paths: readonly string[],
) => Promise<ReadonlySet<string>>;

export interface LedgerPruneResult {
  /** Paths whose entries were removed. */
  readonly removed: readonly string[];
  /** Entries left in the record. */
  readonly remaining: number;
}

/**
 * Removes the entries whose path now equals `HEAD` (a commit, a hand commit or a flush made them
 * committed). The probe runs OUTSIDE the lock on a snapshot; under the lock the record is read again
 * and an entry is removed only when it is still the one the probe judged (same post-image and
 * operation count), so a write that re-imaged a path meanwhile is never pruned by an older answer.
 */
export async function pruneLedgerRecord(
  context: ResolvedProjectHome,
  workspaceId: string,
  owner: LedgerOwner,
  probe: LedgerHeadProbe,
  now: () => string,
): Promise<LedgerPruneResult> {
  const snapshot = await readLedgerRecord(context, workspaceId, owner);
  if (snapshot === undefined || snapshot.entries.length === 0) {
    return { removed: [], remaining: 0 };
  }
  const equal = await probe(
    snapshot.workspaceRoot,
    snapshot.entries.map((entry) => entry.path),
  );
  if (equal.size === 0) return { removed: [], remaining: snapshot.entries.length };
  const judged = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
  return withLedgerLock(context, async () => {
    const current = await readLedgerRecord(context, workspaceId, owner);
    if (current === undefined) return { removed: [], remaining: 0 };
    const prune = new Set(
      current.entries
        .filter((entry) => {
          const before = judged.get(entry.path);
          return (
            equal.has(entry.path) &&
            before?.postSha256 === entry.postSha256 &&
            before.operationCount === entry.operationCount
          );
        })
        .map((entry) => entry.path),
    );
    const next: LedgerRecord = removeLedgerPaths(current, prune, now());
    if (next !== current) await writeLedgerRecord(context, next);
    return { removed: [...prune], remaining: next.entries.length };
  });
}

/** An entry as a caller judged it: removed only while the ledger still holds exactly this. */
export interface LedgerJudgedEntry {
  readonly path: string;
  readonly postSha256: string | null;
  readonly operationCount: number;
}

/**
 * Removes the entries a commit now holds, by the judgement the caller made BEFORE the commit (a
 * manual commit knows which entries it committed): an entry goes only when it is still the one judged
 * (same post-image and operation count), so a write that re-imaged a path meanwhile keeps it. Needs no
 * Git. The record is read again under the control lock; absent entries are fine (idempotent).
 */
export async function removeLedgerEntriesJudged(
  context: ResolvedProjectHome,
  workspaceId: string,
  owner: LedgerOwner,
  judged: readonly LedgerJudgedEntry[],
  now: () => string,
): Promise<LedgerPruneResult> {
  const before = new Map(judged.map((entry) => [entry.path, entry]));
  return withLedgerLock(context, async () => {
    const current = await readLedgerRecord(context, workspaceId, owner);
    if (current === undefined) return { removed: [], remaining: 0 };
    const prune = new Set(
      current.entries
        .filter((entry) => {
          const seen = before.get(entry.path);
          return (
            seen?.postSha256 === entry.postSha256 && seen.operationCount === entry.operationCount
          );
        })
        .map((entry) => entry.path),
    );
    const next: LedgerRecord = removeLedgerPaths(current, prune, now());
    if (next !== current) await writeLedgerRecord(context, next);
    return { removed: [...prune], remaining: next.entries.length };
  });
}
