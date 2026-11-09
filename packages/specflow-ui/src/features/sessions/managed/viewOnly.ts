import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';

/**
 * The view-only bar replaces the Composer (full-session-screen-structure §22.1, View-only
 * Session): without Manage no Turn, answer or Stop is ever the caller's. Not `!start`, which is
 * also false while a Turn runs (the Composer then carries Stop) or the provider is unavailable.
 * Archived has its own bar, and a retained pending start keeps the Composer, whose Retry still owns
 * that request.
 */
export function isViewOnlySession(
  snapshot: SessionSnapshot | undefined,
  retainedStart: boolean,
): boolean {
  return (
    !!snapshot &&
    !snapshot.session.archivedAt &&
    !retainedStart &&
    !snapshot.session.capabilities.manage
  );
}
