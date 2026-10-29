import { GitCapabilityError } from '../../../git/errors';
import type { EngineCommitRequest } from '../../../version-control/commits/port';
import type { BatchPathExpectation, DocumentBatchRecord } from '../changes/journal';
import type { QueueRuntime } from './runtime';
import { headHoldsWholeBatch } from './verify';

/**
 * What the repository says about a batch that may have been committed already (ADR 0016 decisions 7
 * and 13): a commit found by its trailer is the batch only when it touches nothing else AND HEAD
 * holds the recorded content of every path; the trailer alone proves nothing, because the committer
 * address is public.
 */
export type BatchEvidence =
  /** The batch is committed: `sha` carries its trailer. */
  | { readonly kind: 'committed'; readonly sha: string; readonly paths: readonly string[] }
  /** A commit carries the batch's trailer but is not the batch. */
  | { readonly kind: 'foreign-commit' }
  /** The recorded parent is no longer an ancestor of HEAD: history was rewritten. */
  | { readonly kind: 'history-changed' }
  /** No commit carries the trailer. */
  | { readonly kind: 'absent' };

export async function lookUpBatchCommit(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  expectations: readonly BatchPathExpectation[],
): Promise<BatchEvidence> {
  const root = rt.checkout.root;
  const found = await rt.commits.findByOperation(root, batch.operationId, batch.parentHead!);
  if (found.status === 'history-changed') {
    return { kind: 'history-changed' };
  }

  if (found.status === 'absent') {
    return { kind: 'absent' };
  }

  const known = new Set(expectations.map((entry) => entry.path));
  if (
    found.paths.some((path) => !known.has(path)) ||
    !(await headHoldsWholeBatch(rt.commits, root, expectations))
  ) {
    return { kind: 'foreign-commit' };
  }

  return { kind: 'committed', sha: found.sha, paths: found.paths };
}

/** A request the port's read-only `preflight` accepts for the batch (or a subset of its paths). */
export function preflightRequest(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  paths: readonly string[],
): EngineCommitRequest {
  return {
    root: rt.checkout.root,
    expectedBranch: batch.branch,
    paths,
    operationId: batch.operationId,
    kind: 'document-change',
    subject: 'preflight',
  };
}

/**
 * Decisive evidence that an attempt whose outcome was uncertain did NOT commit: no commit carries
 * the batch's trailer, HEAD is still the recorded parent, and the repository can take a commit now
 * (the port's preflight passes, which also means there is no `index.lock`). Anything else is not
 * decisive.
 */
export async function provablyNotCommitted(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  paths: readonly string[],
): Promise<boolean> {
  try {
    const root = rt.checkout.root;
    const found = await rt.commits.findByOperation(root, batch.operationId, batch.parentHead!);
    if (found.status !== 'absent') {
      return false;
    }

    if ((await rt.commits.head(root)) !== batch.parentHead) {
      return false;
    }

    await rt.commits.preflight(preflightRequest(rt, batch, paths));

    return true;
  } catch {
    return false;
  }
}

/** The most read-only checks a search for the refused paths of one batch makes. */
export const REFUSED_PATH_SEARCH_MAX_CHECKS = 64;
/** The longest such a search may take. */
export const REFUSED_PATH_SEARCH_MAX_MS = 30_000;

/**
 * The paths of `paths` that the port refuses with `reason` (for example `path-ignored`), found by
 * halving: a read-only preflight per subset. The search has a budget of
 * {@link REFUSED_PATH_SEARCH_MAX_CHECKS} checks and {@link REFUSED_PATH_SEARCH_MAX_MS}; when it runs
 * out the answer is `undefined` and the caller fails the whole batch.
 */
export async function pathsRefusedWith(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  paths: readonly string[],
  reason: string,
): Promise<string[] | undefined> {
  const startedAt = rt.clock.monotonicMs();
  let checks = 0;
  const exhausted = (): boolean =>
    checks >= REFUSED_PATH_SEARCH_MAX_CHECKS ||
    rt.clock.monotonicMs() - startedAt >= REFUSED_PATH_SEARCH_MAX_MS;
  const refuses = async (subset: readonly string[]): Promise<boolean> => {
    checks += 1;
    try {
      await rt.commits.preflight(preflightRequest(rt, batch, subset));

      return false;
    } catch (error) {
      return error instanceof GitCapabilityError && error.reason === reason;
    }
  };

  const search = async (subset: readonly string[]): Promise<string[] | undefined> => {
    if (subset.length === 0) {
      return [];
    }

    if (exhausted()) {
      return undefined;
    }

    if (!(await refuses(subset))) {
      return [];
    }

    if (subset.length === 1) {
      return [...subset];
    }

    const middle = Math.ceil(subset.length / 2);
    const left = await search(subset.slice(0, middle));
    const right = left === undefined ? undefined : await search(subset.slice(middle));

    return left === undefined || right === undefined ? undefined : [...left, ...right];
  };

  return search(paths);
}
