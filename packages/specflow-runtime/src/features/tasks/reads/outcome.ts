/** `retryable`: the source was busy (the project control lock), a retry soon can succeed. */
export type ReadFailure =
  { kind: 'unavailable'; retryable?: boolean } | { kind: 'not_found' } | { kind: 'expired' };
export type ReadOutcome<T> = { kind: 'ok'; value: T } | ReadFailure;
