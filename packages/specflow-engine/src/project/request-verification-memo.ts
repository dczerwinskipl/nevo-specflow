import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request verification memo for READ paths only.
 *
 * A read request (create-options, overview) calls registry reads and workspace
 * inspections many times. Each call fully re-verifies the physical checkout via
 * several Git processes. Inside `runReadRequest` the checkout identity is
 * verified once per workspace and shared, including in-flight (coalesced) work.
 *
 * The memo lives in an AsyncLocalStorage scope owned by exactly one request, so
 * the first verification of every request is complete, concurrent requests never
 * share results, and nothing outlives the request. Callers that do not enter a
 * scope (all mutation paths) always verify in full. Engines keep their own
 * `readRegistry`, so wrapped/instrumented engines behave unchanged.
 */
const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runReadRequest<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return work();
  return scope.run(new Map(), work);
}

export function memoizeVerification<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const memo = scope.getStore();
  if (!memo) return compute();
  const existing = memo.get(key);
  if (existing) return existing as Promise<T>;
  const pending = compute();
  memo.set(key, pending);
  return pending;
}
