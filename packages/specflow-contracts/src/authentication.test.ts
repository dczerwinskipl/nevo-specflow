import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  AuthSessionResponseSchema,
  OidcStartRequestSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_USERNAME_MAX_LENGTH,
  PasswordLoginRequestSchema,
} from './authentication';

describe('SpecFlow authentication contracts', () => {
  it('models login methods and the concrete authenticated method', () => {
    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticationRequired: true,
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        authenticatedWith: { kind: 'oidc', providerId: 'company' },
        loginMethods: {
          password: { enabled: true },
          oidc: [{ id: 'company', name: 'Company SSO' }],
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticationRequired: false,
        authenticated: false,
        user: { id: 'demo-user', name: 'Demo User' },
        loginMethods: { password: { enabled: false }, oidc: [] },
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        authenticationRequired: true,
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        loginMethods: { password: { enabled: false }, oidc: [] },
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

  it('accepts an optional OIDC return target without making it provider metadata', () => {
    expect(Value.Check(OidcStartRequestSchema, {})).toBe(true);
    expect(Value.Check(OidcStartRequestSchema, { returnTo: '/specs/S1?tab=tasks' })).toBe(true);
  });
});
