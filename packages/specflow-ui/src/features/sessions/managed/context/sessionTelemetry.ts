import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';

/**
 * Whether the provider-limits refresh control is offered for this snapshot
 * (full-session.md "Context"): the reading says it can be refreshed, the user may manage the
 * Session, and the user may see account limits at all (`NOT_AUTHORIZED` masks the whole limits
 * section).
 */
export function isLimitsRefreshOffered(telemetry: TelemetrySnapshot, canRefresh: boolean): boolean {
  const limits = telemetry.limits;

  return (
    canRefresh &&
    limits.refreshable &&
    !(limits.status === 'unavailable' && limits.reason === 'NOT_AUTHORIZED')
  );
}

/**
 * Whether `SessionTelemetrySection` has anything at all to show for this snapshot. Mirrors the
 * per-dimension "missing data hides the section" principle: a snapshot where every one of
 * usage/cost/limits/context is `unavailable` is exactly as absent as no snapshot at all, unless
 * the user can act on the missing limits by refreshing them (`canRefreshLimits`), which keeps the
 * limits section and its control.
 */
export function isTelemetryVisible(
  telemetry: TelemetrySnapshot | undefined,
  canRefreshLimits = false,
): boolean {
  if (!telemetry) {
    return false;
  }

  return (
    telemetry.usage.session.status !== 'unavailable' ||
    telemetry.cost.session.status !== 'unavailable' ||
    telemetry.limits.status !== 'unavailable' ||
    telemetry.context.status !== 'unavailable' ||
    isLimitsRefreshOffered(telemetry, canRefreshLimits)
  );
}
