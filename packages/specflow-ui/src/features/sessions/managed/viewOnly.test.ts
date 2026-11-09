import { describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { isViewOnlySession } from './viewOnly';

const snapshot = (manage: boolean, archivedAt?: string) =>
  ({
    session: {
      capabilities: { view: true, manage, start: false, cancel: false },
      ...(archivedAt ? { archivedAt } : {}),
    },
  }) as SessionSnapshot;

describe('the view-only Session bar', () => {
  it('replaces the Composer only without Manage', () => {
    expect(isViewOnlySession(snapshot(false), false)).toBe(true);
    // Start false with Manage (a running Turn, an unavailable provider) keeps the Composer.
    expect(isViewOnlySession(snapshot(true), false)).toBe(false);
  });

  it('keeps the Composer for a retained pending start, so Retry stays reachable', () => {
    expect(isViewOnlySession(snapshot(false), true)).toBe(false);
  });

  it('leaves an archived Session to the archived bar and waits for the first snapshot', () => {
    expect(isViewOnlySession(snapshot(false, '2026-11-08T10:00:00Z'), false)).toBe(false);
    expect(isViewOnlySession(undefined, false)).toBe(false);
  });
});
