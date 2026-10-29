import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Read-request scope (READ paths only).
 *
 * A read request (overview, workspace, documents, create-options, ...) calls
 * registry reads and workspace inspections many times. Reads MUST NOT spawn Git:
 * inside `runReadRequest` workspace/Project Home verification switches to the
 * filesystem-only trust model (see docs/architecture/project-home-verification.md):
 * Project Home identity is the one verified at Engine open, and every read only
 * re-checks cheap on-disk evidence (marker, Git instance sentinel, `.git` link
 * of the checkout, linked identity marker, realpath containment).
 *
 * The scope also memoises each verification once per workspace, including
 * in-flight (coalesced) work. It lives in an AsyncLocalStorage scope owned by
 * exactly one request, so concurrent requests never share results and nothing
 * outlives the request. Callers that do not enter a scope (every mutation path:
 * create, close/integrate, archive, registry writes, control-lock admission)
 * always run the full Git-backed verification; the only exception is
 * `runGitFreeMutation` (existing-workspace create with Git disabled). Engines keep their own
 * `readRegistry`, so wrapped/instrumented engines behave unchanged.
 */
interface VerificationScope {
  /** Per-request memo; absent for a Git-free mutation (no cached verification may outlive a step). */
  readonly memo?: Map<string, Promise<unknown>>;
}
const scope = new AsyncLocalStorage<VerificationScope>();

export function runReadRequest<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) {
    return work();
  }

  return scope.run({ memo: new Map() }, work);
}

/**
 * A mutation that is not Git-related (create into an EXISTING workspace of a project
 * with Git disabled) uses the same filesystem-only verification as reads but is NOT
 * memoised: each admission step re-checks the disk.
 */
export function runGitFreeMutation<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) {
    return work();
  }

  return scope.run({}, work);
}

/** True while verification must not use Git (read request or Git-free mutation). */
export function isReadRequest(): boolean {
  return scope.getStore() !== undefined;
}

export function memoizeVerification<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const memo = scope.getStore()?.memo;
  if (!memo) {
    return compute();
  }

  const existing = memo.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = compute();
  memo.set(key, pending);

  return pending;
}
