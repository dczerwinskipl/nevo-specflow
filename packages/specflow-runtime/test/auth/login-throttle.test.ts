import { describe, expect, it } from 'vitest';

import { InMemoryPasswordLoginThrottle } from '../../src/auth/login-throttle.js';

describe('password login throttling', () => {
  it('limits attempts per account and allows retry after the window', () => {
    let now = 1_000;
    const throttle = new InMemoryPasswordLoginThrottle({
      now: () => now,
      accountLimit: 2,
      accountWindowMs: 1_000,
      sourceLimit: 10,
      sourceWindowMs: 1_000,
    });

    expect(throttle.consume('Demo', 'source-a')).toEqual({ allowed: true });
    expect(throttle.consume(' demo ', 'source-b')).toEqual({ allowed: true });
    expect(throttle.consume('DEMO', 'source-c')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    now = 2_001;
    expect(throttle.consume('demo', 'source-c')).toEqual({ allowed: true });
  });

  it('limits attempts across accounts from the same source', () => {
    const throttle = new InMemoryPasswordLoginThrottle({
      accountLimit: 10,
      accountWindowMs: 60_000,
      sourceLimit: 2,
      sourceWindowMs: 60_000,
    });

    expect(throttle.consume('one', 'source-a')).toEqual({ allowed: true });
    expect(throttle.consume('two', 'source-a')).toEqual({ allowed: true });
    expect(throttle.consume('three', 'source-a')).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('clears the account counter after successful authentication without clearing source limits', () => {
    const throttle = new InMemoryPasswordLoginThrottle({
      accountLimit: 1,
      accountWindowMs: 60_000,
      sourceLimit: 2,
      sourceWindowMs: 60_000,
    });

    expect(throttle.consume('demo', 'source-a')).toEqual({ allowed: true });
    throttle.resetAccount('demo');

    expect(throttle.consume('demo', 'source-a')).toEqual({ allowed: true });
    expect(throttle.consume('other', 'source-a')).toMatchObject({ allowed: false });
  });
});
