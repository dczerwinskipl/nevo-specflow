import { describe, expect, it } from 'vitest';

import { createRetryableOidcDiscovery } from '../../src/auth/oidc.js';

describe('OIDC discovery lifecycle', () => {
  it('retries after a transient discovery failure and caches only success', async () => {
    let attempts = 0;
    const getConfiguration = createRetryableOidcDiscovery(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error('temporary discovery failure'));
      }
      return Promise.resolve({ issuer: 'https://issuer.example.test' });
    });

    await expect(getConfiguration()).rejects.toThrow('temporary discovery failure');
    await expect(getConfiguration()).resolves.toEqual({
      issuer: 'https://issuer.example.test',
    });
    await expect(getConfiguration()).resolves.toEqual({
      issuer: 'https://issuer.example.test',
    });
    expect(attempts).toBe(2);
  });
});
