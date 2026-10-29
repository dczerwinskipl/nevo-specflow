/**
 * Pure policy for document-change commits: trailer values cut at id boundaries, the effective path
 * set and the per-path classification against a recorded `{ pre, post }`. No I/O; the adapter reads
 * the facts.
 */

/** The commit port truncates a trailer value at this many characters; ids must never be cut mid-way. */
export const TRAILER_VALUE_LIMIT = 200;

/**
 * Joins `ids` with commas and, when they do not fit in `limit` characters, keeps the longest prefix of
 * whole ids that leaves room for the suffix `,+N` (N = ids left out). The result never exceeds `limit`;
 * a single id longer than the limit is left out entirely.
 */
export function cutIdsAtBoundaries(ids: readonly string[], limit = TRAILER_VALUE_LIMIT): string {
  const all = ids.join(',');
  if (all.length <= limit) {
    return all;
  }

  for (let kept = ids.length - 1; kept > 0; kept--) {
    const value = ids.slice(0, kept).join(',') + ',+' + String(ids.length - kept);
    if (value.length <= limit) {
      return value;
    }
  }

  return '+' + String(ids.length);
}

/** Ids a trailer value names (the inverse of `cutIdsAtBoundaries`; the `+N` count is dropped). */
export function idsOfTrailerValue(value: string): string[] {
  return value
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('+'));
}

/** A path's content as Git stores it: a blob id, or `null` when the path does not exist. */
export type BlobState = string | null;

/** Prefix of a state that is not a blob: a directory or submodule where a document is expected. */
const NON_BLOB_PREFIX = 'non-blob:';

/** A state for a path that holds something other than a document file; it equals no blob id. */
export function nonBlobState(what: 'tree' | 'directory' | 'symlink' | 'committed-symlink'): string {
  return NON_BLOB_PREFIX + what;
}

export function isNonBlobState(state: BlobState): boolean {
  return state?.startsWith(NON_BLOB_PREFIX) ?? false;
}

/** What a document path holds in the working tree and in a commit (`HEAD` by default). */
export interface DocumentPathFacts {
  readonly path: string;
  /** Attribute-aware blob id of the working-tree file; `null` when it is absent. */
  readonly working: BlobState;
  /** Blob id in the commit; `null` when the commit does not hold the path. */
  readonly head: BlobState;
}

/** The states a path is recorded to move between: `pre` before the operation, `post` after it. */
export interface DocumentPathExpectation {
  readonly path: string;
  readonly pre: BlobState;
  readonly post: BlobState;
}

/**
 * `committed`: the commit holds the post state. `at-post`: the working tree holds it but the commit
 * does not yet. `at-pre`: the working tree still holds the pre state. `foreign`: anything else.
 */
export type DocumentPathState = 'committed' | 'at-post' | 'at-pre' | 'foreign';

export interface DocumentPathInspection extends DocumentPathFacts {
  readonly state: DocumentPathState;
}

export function classifyDocumentPath(
  facts: DocumentPathFacts,
  expectation: DocumentPathExpectation,
): DocumentPathState {
  if (facts.head === expectation.post) {
    return 'committed';
  }

  if (facts.working === expectation.post) {
    return 'at-post';
  }

  if (facts.working === expectation.pre) {
    return 'at-pre';
  }

  return 'foreign';
}

/** Paths whose working state differs from the commit (the ones a commit can change). */
export function splitEffectivePaths(facts: readonly DocumentPathFacts[]): {
  readonly effective: string[];
  readonly dropped: string[];
} {
  const effective: string[] = [];
  const dropped: string[] = [];
  for (const fact of facts) {
    (fact.working === fact.head ? dropped : effective).push(fact.path);
  }

  return { effective, dropped };
}

/**
 * Replay of a batch: `done` when the commit holds every post state, `pending` when no path is
 * committed and each is still at its pre or post state (the commit is still to be made), otherwise
 * `recovery-required` (foreign content, or only some of the paths committed).
 */
export function decideReplay(
  states: readonly DocumentPathState[],
): 'done' | 'pending' | 'recovery-required' {
  if (states.every((state) => state === 'committed')) {
    return 'done';
  }

  if (states.every((state) => state === 'at-pre' || state === 'at-post')) {
    return 'pending';
  }

  return 'recovery-required';
}
