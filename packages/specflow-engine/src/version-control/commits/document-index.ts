import { failed } from './commit-errors';
import type { DocumentPathFacts } from './document-change';

/** The blob Git stores for an intent-to-add entry (SHA-1 and SHA-256 repositories). */
const EMPTY_BLOBS = new Set([
  'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
  '473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813',
]);

export interface DocumentIndexDeps {
  /** Stage-0 index entries (path -> blob id) of the given literal paths. */
  readonly indexEntries: (paths: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  /** Whether the checkout compares paths case-insensitively (`core.ignorecase`). */
  readonly ignoreCase: () => Promise<boolean>;
  /** Runs one Git mutation naming `paths` (they travel in a pathspec file, never as arguments). */
  readonly mutatePaths: (
    args: readonly string[],
    paths: readonly string[],
  ) => Promise<{ readonly exitCode: number }>;
  /** Takes back index entries the Engine added (best effort). */
  readonly takeBack: (paths: readonly string[]) => Promise<void>;
  /** Called with the paths the Engine is about to add, BEFORE the add runs. */
  readonly owned: (paths: readonly string[]) => void;
  /** Arguments of `add --intent-to-add` (exact-byte options included). */
  readonly addArgs: readonly string[];
}

/**
 * Document batches only. Prepares the index for `commit --only`: stale intent-to-add entries of
 * paths that are absent on disk and untracked in HEAD are removed, and an intent-to-add entry is
 * made for each existing path HEAD does not track and the index does not know yet. A path the user
 * has staged, or a deleted tracked path, is left as it is: `commit --only` takes a deleted tracked
 * path as it is.
 *
 * The paths the Engine is about to add are reported through `owned` BEFORE the add runs, so an add
 * that gets killed (and may have added some of them) can still be taken back. The index lookup
 * follows the file system's case rule: on a case-insensitive checkout a case variant of a tracked
 * path is that tracked path, not a fresh one.
 */
export async function prepareDocumentIndex(
  facts: readonly DocumentPathFacts[],
  deps: DocumentIndexDeps,
): Promise<void> {
  const untracked = facts.filter((fact) => fact.head === null);
  if (untracked.length === 0) return;
  const ignoreCase = await deps.ignoreCase();
  const key = (path: string): string => (ignoreCase ? path.toLowerCase() : path);
  const entries = new Map<string, string>();
  for (const [path, id] of await deps.indexEntries(untracked.map((fact) => fact.path))) {
    entries.set(key(path), id);
  }
  const stale = untracked.filter(
    (fact) =>
      fact.working === null && EMPTY_BLOBS.has(entries.get(key(fact.path))?.toLowerCase() ?? ''),
  );
  if (stale.length > 0) {
    const reset = await deps.mutatePaths(
      ['reset', '-q'],
      stale.map((fact) => fact.path),
    );
    if (reset.exitCode !== 0) throw failed('stale-intent-to-add');
  }
  const fresh = untracked
    .filter((fact) => fact.working !== null && !entries.has(key(fact.path)))
    .map((fact) => fact.path);
  if (fresh.length === 0) return;
  deps.owned(fresh);
  const added = await deps.mutatePaths(deps.addArgs, fresh);
  if (added.exitCode !== 0) {
    await deps.takeBack(fresh);
    throw failed('intent-to-add');
  }
}
