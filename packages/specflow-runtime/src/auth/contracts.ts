import { Type } from 'typebox';

export const PasswordLoginBodySchema = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: 256 }),
    password: Type.String({ minLength: 1, maxLength: 1_024 }),
  },
  { additionalProperties: false },
);

export const AuthProviderSchema = Type.Union([
  Type.Literal('password'),
  Type.Literal('google'),
]);

export const AuthUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const AuthSessionSchema = Type.Object(
  {
    authenticated: Type.Boolean(),
    user: Type.Optional(AuthUserSchema),
    provider: Type.Optional(AuthProviderSchema),
    availableProviders: Type.Array(AuthProviderSchema),
  },
  { additionalProperties: false },
);

export const AuthErrorSchema = Type.Object(
  {
    error: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
