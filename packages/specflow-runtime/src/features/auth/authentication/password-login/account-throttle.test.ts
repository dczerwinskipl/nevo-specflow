import { describe, expect, it } from 'vitest';

import { InMemoryPasswordAccountThrottle } from './account-throttle';

describe('password account throttling', () => {
  it('limits attempts per canonical account and allows retry after the window', () => {
    let now = 1_000;
    const throttle = new InMemoryPasswordAccountThrottle({
      now: () => now,
      accountLimit: 2,
      accountWindowMs: 1_000,
    });

    expect(throttle.consume('Demo')).toEqual({ allowed: true });
    expect(throttle.consume(' demo ')).toEqual({ allowed: true });
    expect(throttle.consume('DEMO')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now = 2_001;
    expect(throttle.consume('demo')).toEqual({ allowed: true });
  });

  it('clears the account counter after successful authentication', () => {
    const throttle = new InMemoryPasswordAccountThrottle({
      accountLimit: 1,
      accountWindowMs: 60_000,
    });

    expect(throttle.consume('demo')).toEqual({ allowed: true });
    throttle.reset('demo');
    expect(throttle.consume('DEMO')).toEqual({ allowed: true });
  });

  it('fails closed at key capacity without evicting a live account limiter', () => {
    const throttle = new InMemoryPasswordAccountThrottle({
      accountLimit: 10,
      accountWindowMs: 60_000,
      maxAccountKeys: 1,
    });

    expect(throttle.consume('one')).toEqual({ allowed: true });
    expect(throttle.consume('two')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(throttle.consume('one')).toEqual({ allowed: true });
  });
});
