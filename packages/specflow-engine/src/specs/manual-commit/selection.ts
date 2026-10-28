/**
 * What a manual commit may hold, decided from the ledger alone (ADR 0018 decision 8): the entries of
 * the scope, the optional subset closed under shared operation ids, and the paths whose content was
 * edited since the Engine left it. Pure: no I/O, no Git.
 */
import { sha256Hex } from '../../hash';
import { ledgerOwnerKey, type LedgerRecord } from '../durable/ledger/model';
import { ledgerRevisionOf } from '../durable/ledger/revision';

/** One ledger entry as the manual commit sees it: the entry plus the owner whose record holds it. */
export interface ScopeEntry {
  /** Owner key (`definitions`, `specification-<id>`). */
  readonly owner: string;
  readonly path: string;
  /** sha256 of the content the Engine left on disk; `null` for a removed file. */
  readonly postSha256: string | null;
  readonly operationIds: readonly string[];
  readonly operationCount: number;
  readonly recordedAt: string;
  readonly reason: string;
}

const byPath = (left: { path: string }, right: { path: string }): number =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

/** Every entry of the records, with its owner, sorted by path. */
export function scopeEntriesOf(records: readonly LedgerRecord[]): ScopeEntry[] {
  return records
    .flatMap((record) =>
      record.entries.map((entry) => ({
        owner: ledgerOwnerKey(record.owner),
        path: entry.path,
        postSha256: entry.postSha256,
        operationIds: entry.operationIds,
        operationCount: entry.operationCount,
        recordedAt: entry.recordedAt,
        reason: entry.reason,
      })),
    )
    .sort(byPath);
}

/** The `ledgerRevision` of the entries of a scope (the same value `GET .../uncommitted` quotes). */
export function revisionOfScope(
  entries: readonly Pick<ScopeEntry, 'path' | 'postSha256'>[],
): string {
  return ledgerRevisionOf(entries);
}

/**
 * The paths that must travel together with `seed`: an operation's file and its registry change are
 * never split, so every path that shares an operation id with a selected path is selected too, and
 * so on transitively. Sorted. Entries keep at most their newest 50 operation ids, so an entry whose
 * `operationCount` exceeds its ids has forgotten operations that may have touched other paths. When
 * any entry of the scope is truncated that way, closure cannot be proven for a partial selection and
 * the whole scope is returned (committing everything never splits an operation).
 */
export function closureOf(entries: readonly ScopeEntry[], seed: Iterable<string>): string[] {
  const selected = new Set(seed);
  if (
    selected.size > 0 &&
    entries.some((entry) => entry.operationCount > entry.operationIds.length)
  ) {
    return entries.map((entry) => entry.path).sort();
  }
  const byOperation = new Map<string, string[]>();
  for (const entry of entries) {
    for (const id of entry.operationIds) {
      byOperation.set(id, [...(byOperation.get(id) ?? []), entry.path]);
    }
  }
  const byPathEntries = new Map(entries.map((entry) => [entry.path, entry]));
  const queue = [...selected];
  while (queue.length > 0) {
    const path = queue.pop()!;
    for (const id of byPathEntries.get(path)?.operationIds ?? []) {
      for (const other of byOperation.get(id) ?? []) {
        if (!selected.has(other)) {
          selected.add(other);
          queue.push(other);
        }
      }
    }
  }
  return [...selected].sort();
}

export type SubsetCheck =
  | { readonly ok: true; readonly selected: readonly ScopeEntry[] }
  /** Paths that are not ledger paths of the scope. */
  | { readonly ok: false; readonly kind: 'unknown-path'; readonly paths: readonly string[] }
  /** The subset splits an operation: `paths` is the closure it needs. */
  | { readonly ok: false; readonly kind: 'not-closed'; readonly paths: readonly string[] };

/** Checks the optional subset against the entries of the scope; without one, every entry is selected. */
export function selectEntries(
  entries: readonly ScopeEntry[],
  requested: readonly string[] | undefined,
): SubsetCheck {
  if (requested === undefined) return { ok: true, selected: entries };
  const known = new Set(entries.map((entry) => entry.path));
  const wanted = [...new Set(requested)];
  const unknown = wanted.filter((path) => !known.has(path)).sort();
  if (unknown.length > 0) return { ok: false, kind: 'unknown-path', paths: unknown };
  const closure = closureOf(entries, wanted);
  if (closure.length !== wanted.length) return { ok: false, kind: 'not-closed', paths: closure };
  const chosen = new Set(wanted);
  return { ok: true, selected: entries.filter((entry) => chosen.has(entry.path)) };
}

/**
 * What the working tree holds for a path: the sha256 of its content, `null` when the path is absent and
 * `undefined` when it holds something that cannot be read as a file (a directory, a denied file).
 */
export type WorkingContent = string | null | undefined;

/**
 * The selected paths whose content is not the post-image the ledger recorded (someone edited the file
 * since, or removed it, or put something else there). Any of them refuses the whole request.
 */
export function editedSince(
  entries: readonly ScopeEntry[],
  working: ReadonlyMap<string, WorkingContent>,
): string[] {
  return entries
    .filter((entry) => {
      const content = working.get(entry.path);
      return content === undefined || content !== entry.postSha256;
    })
    .map((entry) => entry.path)
    .sort();
}

/** The canonical hash of a request (the operation id is not part of it): the idempotency key of the body. */
export function fingerprintOfRequest(input: {
  readonly scope: string;
  readonly specId: string | undefined;
  readonly message: string;
  readonly paths: readonly string[] | undefined;
  readonly ledgerRevision: string | undefined;
}): string {
  return sha256Hex(
    JSON.stringify({
      scope: input.scope,
      specId: input.specId ?? null,
      message: input.message,
      paths: input.paths === undefined ? null : [...new Set(input.paths)].sort(),
      ledgerRevision: input.ledgerRevision ?? null,
    }),
  );
}
