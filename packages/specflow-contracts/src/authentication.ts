import { Type, type Static } from 'typebox';

export const PASSWORD_USERNAME_MAX_LENGTH = 256;
export const PASSWORD_MAX_LENGTH = 1_024;

export const AuthProviderSchema = Type.Union([Type.Literal('password'), Type.Literal('oidc')]);
export type AuthProvider = Static<typeof AuthProviderSchema>;

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type AuthUser = Static<typeof AuthUserSchema>;

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

export const AuthSessionResponseSchema = Type.Union([
  AuthenticatedSessionSchema,
  UnauthenticatedSessionSchema,
]);
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;

export const PasswordLoginRequestSchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: PASSWORD_USERNAME_MAX_LENGTH }),
    password: Type.String({ minLength: 1, maxLength: PASSWORD_MAX_LENGTH }),
  },
  { additionalProperties: false },
);
export type PasswordLoginRequest = Static<typeof PasswordLoginRequestSchema>;

export const PasswordLoginErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('invalid_credentials'),
      Type.Literal('rate_limited'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type PasswordLoginErrorResponse = Static<typeof PasswordLoginErrorResponseSchema>;

export const OidcStartErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('rate_limited'),
      Type.Literal('provider_unavailable'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type OidcStartErrorResponse = Static<typeof OidcStartErrorResponseSchema>;

export const OidcCallbackErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('provider_unavailable'),
      Type.Literal('invalid_oidc_transaction'),
      Type.Literal('oidc_authentication_failed'),
      Type.Literal('identity_not_allowed'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type OidcCallbackErrorResponse = Static<typeof OidcCallbackErrorResponseSchema>;
