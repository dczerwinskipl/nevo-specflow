/**
 * The retry schedule of a transient commit failure (ADR 0016 decision 13): 1 s, doubling to 60 s,
 * then every 60 s for as long as the blocker lasts. A transient failure never ends the retries: the
 * files stay and the batch is committed once Git works again. The stored attempt counter saturates at
 * {@link ATTEMPT_COUNTER_CAP} so the journal stays valid however long the outage lasts.
 */
export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;
export const ATTEMPT_COUNTER_CAP = 10;

/** The wait after the `failedAttempts`-th failed attempt (1 for the first). */
export function backoffMs(failedAttempts: number): number {
  const exponent = Math.max(0, Math.min(failedAttempts - 1, 30));

  return Math.min(BACKOFF_FIRST_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

/** The counter after one more failed attempt (saturating). */
export function countFailedAttempt(failedAttempts: number): number {
  return Math.min(failedAttempts + 1, ATTEMPT_COUNTER_CAP);
}

/** When the next attempt may start: the failure time plus the wait, as an ISO instant. */
export function nextAttemptAt(failedAt: string, failedAttempts: number): string {
  return new Date(Date.parse(failedAt) + backoffMs(failedAttempts)).toISOString();
}
