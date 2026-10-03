import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  AuthSessionResponseSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_USERNAME_MAX_LENGTH,
  PasswordLoginRequestSchema,
} from '../src/authentication';

describe('SpecFlow authentication contracts', () => {
  it('models authenticated and unauthenticated sessions as distinct states', () => {
    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        provider: 'oidc',
        availableProviders: ['oidc'],
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticated: false,
        availableProviders: [],
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticated: true,
        availableProviders: ['oidc'],
      }),
    ).toBe(false);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticated: false,
        provider: 'oidc',
        availableProviders: ['oidc'],
      }),
    ).toBe(false);
  });

  it('owns password-login transport limits using JSON Schema code-point length', () => {
    expect(
      Value.Check(PasswordLoginRequestSchema, {
        username: '😀'.repeat(PASSWORD_USERNAME_MAX_LENGTH),
        password: '😀'.repeat(PASSWORD_MAX_LENGTH),
      }),
    ).toBe(true);

    expect(
      Value.Check(PasswordLoginRequestSchema, {
        username: '😀'.repeat(PASSWORD_USERNAME_MAX_LENGTH + 1),
        password: 'p',
      }),
    ).toBe(false);

    expect(
      Value.Check(PasswordLoginRequestSchema, {
        username: 'u',
        password: '😀'.repeat(PASSWORD_MAX_LENGTH + 1),
      }),
    ).toBe(false);
  });
});
