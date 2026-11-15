import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped verification.
 *
 * A read request (overview, workspace, documents, create-options, ...) calls
 * registry reads and workspace inspections many times. Reads MUST NOT spawn Git:
 * inside `runReadRequest` workspace/Project Home verification switches to the
 * filesystem-only trust model (see "Verification trust model" in
 * docs/architecture/runtime/project-home-and-workspaces.md):
 * Project Home identity is the one verified at Engine open, and every read only
 * re-checks cheap on-disk evidence (marker, Git instance sentinel, `.git` link
 * of the checkout, linked identity marker, realpath containment).
 *
 * A workflow mutation (`runVerifiedMutation`: one step start, finish, Task change, ...)
 * keeps the full Git-backed verification but runs it once per operation: the
 * control-lock admission resolves the Project Home with Git afresh (and refreshes
 * the memo), and every later membership check of the same operation reuses what it
 * proved instead of resolving the Project Home again for each Specification lookup.
 * The operation changes neither the registry nor any checkout's Git identity.
 *
 * The scope memoises each verification once, including in-flight (coalesced) work.
 * It lives in an AsyncLocalStorage scope owned by exactly one request, so concurrent
 * requests never share results and nothing outlives the request. Callers that do not
 * enter a scope (create, close/integrate, archive, registry writes) always run the
 * full Git-backed verification at every step; `runGitFreeMutation` (existing-workspace
 * create with Git disabled) uses the read checks without a memo. Engines keep their own
 * `readRegistry`, so wrapped/instrumented engines behave unchanged.
 */
interface VerificationScope {
  /** Per-request memo; absent for a Git-free mutation (no cached verification may outlive a step). */
  readonly memo?: Map<string, Promise<unknown>>;
  /** A workflow mutation: verification uses Git (once per operation), not the disk-only checks. */
  readonly gitBacked?: true;
  /** Evidence a workflow mutation proved with Git, by kind (the control-lock home proof). */
  readonly proven?: Map<string, unknown>;
}
const scope = new AsyncLocalStorage<VerificationScope>();

export function runReadRequest<T>(work: () => Promise<T>): Promise<T> {
  const current = scope.getStore();
  // A read inside a read keeps its scope; a read inside a workflow mutation still reads without Git.
  if (current && current.gitBacked === undefined) {
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

/**
 * A workflow mutation: full Git-backed verification, once per operation (see above). Inside an
 * existing scope (a read, or the same mutation) the work keeps that scope.
 */
export function runVerifiedMutation<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) {
    return work();
  }

  return scope.run({ memo: new Map(), gitBacked: true, proven: new Map() }, work);
}

/** True while verification must not use Git (read request or Git-free mutation). */
export function isReadRequest(): boolean {
  const current = scope.getStore();

  return current !== undefined && current.gitBacked === undefined;
}

/**
 * Remember `compute` for the rest of the request. With `refresh` it is computed again and replaces
 * what was remembered (an admission that must re-prove the Project Home with Git).
 */
export function memoizeVerification<T>(
  key: string,
  compute: () => Promise<T>,
  options: { readonly refresh?: boolean } = {},
): Promise<T> {
  const memo = scope.getStore()?.memo;
  if (!memo) {
    return compute();
  }

  const existing = memo.get(key);
  if (existing && options.refresh !== true) {
    return existing as Promise<T>;
  }

  const pending = compute();
  memo.set(key, pending);

  return pending;
}

/**
 * What the current workflow mutation last proved with Git under `key` (`undefined` outside one).
 * The caller decides whether that proof still applies (it compares fresh on-disk evidence with it).
 */
export function provenInOperation<T>(key: string): T | undefined {
  return scope.getStore()?.proven?.get(key) as T | undefined;
}

/** Record evidence just proved with Git for the rest of the workflow mutation (no-op outside one). */
export function rememberProvenInOperation(key: string, value: unknown): void {
  scope.getStore()?.proven?.set(key, value);
}
