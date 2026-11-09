import type { StartSessionAction } from '../../specs/read-model';

/**
 * Whether the New Session entry points of a Specification show (full-session.md "Starting a Session"):
 * when the start is available, and with `no_provider` too (the start form explains it). Omitted for
 * `forbidden`, `sessions_disabled` and any other reason, and while the workspace read is unknown.
 */
export function startSessionOffered(action: StartSessionAction | undefined): boolean {
  return !!action && (action.available || action.reason === 'no_provider');
}

/**
 * What replaces the start form when its route is opened directly and the workspace read refuses
 * the start. While the read loads or failed, nothing does: the form renders as before.
 */
export function startRouteRefusal(
  action: StartSessionAction | undefined,
): 'forbidden' | 'sessions_disabled' | undefined {
  if (!action || action.available) {
    return undefined;
  }

  return action.reason === 'forbidden' || action.reason === 'sessions_disabled'
    ? action.reason
    : undefined;
}
