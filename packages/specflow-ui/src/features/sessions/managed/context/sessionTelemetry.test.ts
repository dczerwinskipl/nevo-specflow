import { validateTelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { describe, expect, it } from 'vitest';
import { isLimitsRefreshOffered, isTelemetryVisible } from './sessionTelemetry';
import {
  fullTelemetrySnapshot,
  limitsTelemetry,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
  unavailableTelemetrySnapshot,
} from './sessionTelemetry.stories-support';

describe('telemetry fixtures', () => {
  it.each(
    Object.entries({
      fullTelemetrySnapshot,
      partialAntigravityTelemetrySnapshot,
      staleTelemetrySnapshot,
      unavailableTelemetrySnapshot,
      ...limitsTelemetry,
    }),
  )('%s is a valid contract TelemetrySnapshot', (_name, snapshot) => {
    expect(validateTelemetrySnapshot(snapshot)).toBe(true);
  });
});

describe('telemetry visibility', () => {
  it('hides a snapshot whose every dimension is unavailable', () => {
    expect(isTelemetryVisible(undefined)).toBe(false);
    expect(isTelemetryVisible(unavailableTelemetrySnapshot)).toBe(false);
    expect(isTelemetryVisible(fullTelemetrySnapshot)).toBe(true);
  });

  it('keeps unread limits visible only when the user can refresh them', () => {
    const unread = { ...unavailableTelemetrySnapshot, limits: limitsTelemetry.notRead.limits };
    expect(isTelemetryVisible(unread)).toBe(false);
    expect(isTelemetryVisible(unread, true)).toBe(true);
  });

  it('offers the refresh only for refreshable limits the user may see and manage', () => {
    expect(isLimitsRefreshOffered(fullTelemetrySnapshot, true)).toBe(true);
    expect(isLimitsRefreshOffered(fullTelemetrySnapshot, false)).toBe(false);
    expect(isLimitsRefreshOffered(limitsTelemetry.notRefreshable, true)).toBe(false);
    expect(isLimitsRefreshOffered(limitsTelemetry.notAuthorized, true)).toBe(false);
    expect(
      isLimitsRefreshOffered(
        {
          ...limitsTelemetry.notAuthorized,
          limits: { ...limitsTelemetry.notAuthorized.limits, refreshable: true },
        },
        true,
      ),
    ).toBe(false);
  });
});
