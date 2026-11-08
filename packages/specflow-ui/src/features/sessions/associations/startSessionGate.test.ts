import { describe, expect, it } from 'vitest';
import { startRouteRefusal, startSessionOffered } from './startSessionGate';

describe('New Session gating', () => {
  it('offers the start when available or only without a provider', () => {
    expect(startSessionOffered({ available: true })).toBe(true);
    expect(startSessionOffered({ available: true, path: '/api/demo/specs/a/sessions' })).toBe(true);
    expect(startSessionOffered({ available: false, reason: 'no_provider' })).toBe(true);
  });

  it('omits the entry points when refused, disabled or not yet known', () => {
    expect(startSessionOffered({ available: false, reason: 'forbidden' })).toBe(false);
    expect(startSessionOffered({ available: false, reason: 'sessions_disabled' })).toBe(false);
    expect(startSessionOffered({ available: false, reason: 'not_implemented' })).toBe(false);
    expect(startSessionOffered(undefined)).toBe(false);
  });

  it('refuses the start route only for forbidden and turned-off Sessions', () => {
    expect(startRouteRefusal({ available: false, reason: 'forbidden' })).toBe('forbidden');
    expect(startRouteRefusal({ available: false, reason: 'sessions_disabled' })).toBe(
      'sessions_disabled',
    );
    expect(startRouteRefusal({ available: false, reason: 'no_provider' })).toBeUndefined();
    expect(startRouteRefusal({ available: true })).toBeUndefined();
    expect(startRouteRefusal(undefined)).toBeUndefined();
  });
});
