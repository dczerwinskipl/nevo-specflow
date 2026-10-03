import { describe, expect, it } from 'vitest';

import { createRetryableOidcDiscovery } from '../../../../src/auth/authentication/oidc/discovery';

describe('OIDC discovery lifecycle', () => {
  it('coalesces failures behind a cooldown, then retries and caches success', async () => {
    let attempts = 0;
    let now = 1_000;
    const getConfiguration = createRetryableOidcDiscovery(
      () => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new Error('temporary discovery failure'));
        }
        return Promise.resolve({ issuer: 'https://issuer.example.test' });
      },
      {
        now: () => now,
        retryDelayMs: 1_000,
      },
    );

    await expect(getConfiguration()).rejects.toThrow('temporary discovery failure');
    await expect(getConfiguration()).rejects.toThrow('temporary discovery failure');
    expect(attempts).toBe(1);

    now += 1_001;
    await expect(getConfiguration()).resolves.toEqual({
      issuer: 'https://issuer.example.test',
    });
    await expect(getConfiguration()).resolves.toEqual({
      issuer: 'https://issuer.example.test',
    });
    expect(attempts).toBe(2);
  });
});
