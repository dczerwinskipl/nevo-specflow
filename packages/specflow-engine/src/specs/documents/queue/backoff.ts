/**
 * The retry schedule of a transient commit failure (ADR 0016 decision 13): 1 s, doubling to 60 s,
 * at most 10 failed attempts; the tenth failure ends the retries (`retries-exhausted`).
 */
export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;
export const DOCUMENT_RETRY_MAX_ATTEMPTS = 10;

/** The wait after the `failedAttempts`-th failed attempt (1 for the first). */
export function backoffMs(failedAttempts: number): number {
  const exponent = Math.max(0, Math.min(failedAttempts - 1, 30));
  return Math.min(BACKOFF_FIRST_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

/** Whether the retries are used up after this many failed attempts. */
export function retriesExhausted(failedAttempts: number): boolean {
  return failedAttempts >= DOCUMENT_RETRY_MAX_ATTEMPTS;
}

/** When the next attempt may start: the failure time plus the wait, as an ISO instant. */
export function nextAttemptAt(failedAt: string, failedAttempts: number): string {
  return new Date(Date.parse(failedAt) + backoffMs(failedAttempts)).toISOString();
}
