import { Type, type Static } from 'typebox';

export const PASSWORD_USERNAME_MAX_LENGTH = 256;
export const PASSWORD_MAX_LENGTH = 1_024;
export const OIDC_RETURN_TO_MAX_LENGTH = 2_048;

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type AuthUser = Static<typeof AuthUserSchema>;

export const AuthSessionMethodSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('password'),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('oidc'),
      providerId: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
]);
export type AuthSessionMethod = Static<typeof AuthSessionMethodSchema>;

export const AuthLoginMethodsSchema = Type.Object(
  {
    password: Type.Object(
      {
        enabled: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    oidc: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1 }),
          name: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type AuthLoginMethods = Static<typeof AuthLoginMethodsSchema>;

const AuthenticatedSessionSchema = Type.Object(
  {
    authenticationRequired: Type.Boolean(),
    authenticated: Type.Literal(true),
    user: AuthUserSchema,
    authenticatedWith: AuthSessionMethodSchema,
    loginMethods: AuthLoginMethodsSchema,
  },
  { additionalProperties: false },
);

const UnauthenticatedSessionSchema = Type.Object(
  {
    authenticationRequired: Type.Boolean(),
    authenticated: Type.Literal(false),
    user: Type.Optional(AuthUserSchema),
    loginMethods: AuthLoginMethodsSchema,
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

export const OidcStartRequestSchema = Type.Object(
  {
    returnTo: Type.Optional(Type.String({ minLength: 1, maxLength: OIDC_RETURN_TO_MAX_LENGTH })),
  },
  { additionalProperties: false },
);
export type OidcStartRequest = Static<typeof OidcStartRequestSchema>;

export const OidcStartSuccessResponseSchema = Type.Object(
  {
    authorizationUrl: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type OidcStartSuccessResponse = Static<typeof OidcStartSuccessResponseSchema>;

export const OidcStartErrorResponseSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('invalid_return_to'),
      Type.Literal('rate_limited'),
      Type.Literal('provider_unavailable'),
      Type.Literal('service_unavailable'),
    ]),
  },
  { additionalProperties: false },
);
export type OidcStartErrorResponse = Static<typeof OidcStartErrorResponseSchema>;

export const OidcCallbackErrorCodeSchema = Type.Union([
  Type.Literal('provider_unavailable'),
  Type.Literal('invalid_oidc_transaction'),
  Type.Literal('oidc_authentication_failed'),
  Type.Literal('identity_not_allowed'),
  Type.Literal('service_unavailable'),
]);
export type OidcCallbackErrorCode = Static<typeof OidcCallbackErrorCodeSchema>;

export const OidcCallbackErrorResponseSchema = Type.Object(
  {
    error: OidcCallbackErrorCodeSchema,
  },
  { additionalProperties: false },
);
export type OidcCallbackErrorResponse = Static<typeof OidcCallbackErrorResponseSchema>;
