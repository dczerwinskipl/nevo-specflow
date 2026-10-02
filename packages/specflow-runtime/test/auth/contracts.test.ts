import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { AuthSessionSchema, PasswordLoginBodySchema } from '../../src/auth/contracts.js';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_USERNAME_MAX_LENGTH,
} from '../../src/auth/password-policy.js';

describe('auth contracts', () => {
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

  it('enforces the shared password login length policy at the HTTP boundary', () => {
    expect(
      Value.Check(PasswordLoginBodySchema, {
        username: 'u'.repeat(PASSWORD_USERNAME_MAX_LENGTH),
        password: 'p'.repeat(PASSWORD_MAX_LENGTH),
      }),
    ).toBe(true);

    expect(
      Value.Check(PasswordLoginBodySchema, {
        username: 'u'.repeat(PASSWORD_USERNAME_MAX_LENGTH + 1),
        password: 'p',
      }),
    ).toBe(false);

    expect(
      Value.Check(PasswordLoginBodySchema, {
        username: 'u',
        password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1),
      }),
    ).toBe(false);
  });
});
