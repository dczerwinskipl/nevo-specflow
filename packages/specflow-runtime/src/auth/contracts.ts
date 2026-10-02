import { Type, type Static } from 'typebox';

export const PasswordLoginBodySchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: 256 }),
    password: Type.String({ minLength: 1, maxLength: 1_024 }),
  },
  { additionalProperties: false },
);

export type PasswordLoginRequest = Static<typeof PasswordLoginBodySchema>;

export const AuthProviderSchema = Type.Union([Type.Literal('password'), Type.Literal('google')]);

export type AuthProviderContract = Static<typeof AuthProviderSchema>;

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type AuthUserContract = Static<typeof AuthUserSchema>;

export const AuthSessionSchema = Type.Object(
  {
    authenticated: Type.Boolean(),
    user: Type.Optional(AuthUserSchema),
    provider: Type.Optional(AuthProviderSchema),
    availableProviders: Type.Array(AuthProviderSchema),
  },
  { additionalProperties: false },
);

export type AuthSessionResponse = Static<typeof AuthSessionSchema>;

export const AuthErrorSchema = Type.Object(
  {
    error: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type AuthErrorResponse = Static<typeof AuthErrorSchema>;
