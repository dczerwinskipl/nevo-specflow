import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { AuthSessionSchema } from '../../src/auth/contracts.js';

describe('auth session contract', () => {
  it('models authenticated and unauthenticated sessions as distinct states', () => {
    expect(
      Value.Check(AuthSessionSchema, {
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        provider: 'oidc',
        availableProviders: ['oidc'],
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionSchema, {
        authenticated: false,
        availableProviders: [],
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionSchema, {
        authenticated: true,
        availableProviders: ['oidc'],
      }),
    ).toBe(false);

    expect(
      Value.Check(AuthSessionSchema, {
        authenticated: false,
        provider: 'oidc',
        availableProviders: ['oidc'],
      }),
    ).toBe(false);
  });
});
