import { Type, type Static } from 'typebox';

import { PASSWORD_MAX_LENGTH, PASSWORD_USERNAME_MAX_LENGTH } from './password-policy.js';

export const PasswordLoginBodySchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: PASSWORD_USERNAME_MAX_LENGTH }),
    password: Type.String({ minLength: 1, maxLength: PASSWORD_MAX_LENGTH }),
  },
  { additionalProperties: false },
);

export type PasswordLoginRequest = Static<typeof PasswordLoginBodySchema>;

export const AuthProviderSchema = Type.Union([Type.Literal('password'), Type.Literal('oidc')]);

export type AuthProviderContract = Static<typeof AuthProviderSchema>;

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type AuthUserContract = Static<typeof AuthUserSchema>;

const AuthenticatedSessionSchema = Type.Object(
  {
    authenticated: Type.Literal(true),
    user: AuthUserSchema,
    provider: AuthProviderSchema,
    availableProviders: Type.Array(AuthProviderSchema),
  },
  { additionalProperties: false },
);

const UnauthenticatedSessionSchema = Type.Object(
  {
    authenticated: Type.Literal(false),
    user: Type.Optional(AuthUserSchema),
    availableProviders: Type.Array(AuthProviderSchema),
  },
  { additionalProperties: false },
);

export const AuthSessionSchema = Type.Union([
  AuthenticatedSessionSchema,
  UnauthenticatedSessionSchema,
]);

export type AuthSessionResponse = Static<typeof AuthSessionSchema>;

export const AuthErrorCodeSchema = Type.Union([
  Type.Literal('provider_unavailable'),
  Type.Literal('invalid_credentials'),
  Type.Literal('rate_limited'),
  Type.Literal('invalid_oidc_transaction'),
  Type.Literal('oidc_authentication_failed'),
  Type.Literal('identity_not_allowed'),
]);

export type AuthErrorCode = Static<typeof AuthErrorCodeSchema>;

export const AuthErrorSchema = Type.Object(
  {
    error: AuthErrorCodeSchema,
  },
  { additionalProperties: false },
);

export type AuthErrorResponse = Static<typeof AuthErrorSchema>;
