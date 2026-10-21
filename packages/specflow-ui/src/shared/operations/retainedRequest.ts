export interface RequestAttempt<T> {
  signature: string;
  input: T;
}
/**
 * Keeps one idempotency key per distinct body: an identical retry or status check reuses it,
 * any changed field gets a new one. `key` names the identity field (`requestId` / `operationId`).
 */
export function retainRequest<T extends Record<K, string>, K extends string = 'requestId'>(
  holder: { current: RequestAttempt<T> | null },
  body: Omit<T, K>,
  newId: () => string = () => crypto.randomUUID(),
  key: K = 'requestId' as K,
): T {
  const signature = JSON.stringify(body);
  if (holder.current?.signature !== signature)
    holder.current = { signature, input: { ...body, [key]: newId() } as unknown as T };
  return holder.current.input;
}
/**
 * Sends one retained request and releases its idempotency key once the server confirmed it. The key
 * survives only a failed or unconfirmed attempt, so an identical later request (for example adding a
 * folder again after deleting it) is a new operation instead of a replay of the cached result.
 *
 * `releaseOnError` names the failures that are a definite answer (the server saw the request and
 * refused it): their key is released too, because replaying it could never succeed. Any other
 * failure keeps the key so the same operation can be retried safely.
 */
export async function sendRetained<T extends Record<K, string>, R, K extends string = 'requestId'>(
  holder: { current: RequestAttempt<T> | null },
  body: Omit<T, K>,
  send: (input: T) => Promise<R>,
  key: K = 'requestId' as K,
  releaseOnError?: (error: unknown) => boolean,
): Promise<R> {
  try {
    const result = await send(retainRequest(holder, body, undefined, key));
    holder.current = null;
    return result;
  } catch (error) {
    if (releaseOnError?.(error)) holder.current = null;
    throw error;
  }
}
