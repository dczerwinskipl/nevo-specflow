import { describe, expect, it } from 'vitest';

import { InMemoryOidcStartThrottle } from '../../src/auth/oidc-start-throttle.js';

describe('OIDC start throttling', () => {
  it('limits transaction starts per source and allows retry after the window', () => {
    let now = 1_000;
    const throttle = new InMemoryOidcStartThrottle({
      now: () => now,
      sourceLimit: 2,
      sourceWindowMs: 1_000,
    });

    expect(throttle.consume('source-a')).toEqual({ allowed: true });
    expect(throttle.consume('source-a')).toEqual({ allowed: true });
    expect(throttle.consume('source-a')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now = 2_001;
    expect(throttle.consume('source-a')).toEqual({ allowed: true });
  });

  it('tracks sources independently', () => {
    const throttle = new InMemoryOidcStartThrottle({
      sourceLimit: 1,
      sourceWindowMs: 60_000,
    });

    expect(throttle.consume('source-a')).toEqual({ allowed: true });
    expect(throttle.consume('source-a')).toMatchObject({ allowed: false });
    expect(throttle.consume('source-b')).toEqual({ allowed: true });
  });
});
