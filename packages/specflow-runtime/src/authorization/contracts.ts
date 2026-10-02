import { Type, type Static } from 'typebox';

import {
  SessionAuthorization,
  SettingsAuthorization,
  SpecAuthorization,
} from '@nevo/specflow-contracts';

export const AuthorizationResourceNameSchema = Type.Union([
  Type.Literal(SpecAuthorization.name),
  Type.Literal(SessionAuthorization.name),
  Type.Literal(SettingsAuthorization.name),
]);

export const AuthorizationScopeSchema = Type.Record(
  Type.String({ minLength: 1 }),
  Type.String({ minLength: 1 }),
);

export const AuthorizationResourceQuerySchema = Type.Object(
  {
    name: AuthorizationResourceNameSchema,
    scope: AuthorizationScopeSchema,
  },
  { additionalProperties: false },
);

export const AuthorizationCapabilitiesBodySchema = Type.Object(
  {
    resource: AuthorizationResourceQuerySchema,
  },
  { additionalProperties: false },
);

export const AuthorizationCapabilitiesResponseSchema = Type.Object(
  {
    resource: AuthorizationResourceQuerySchema,
    capabilities: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const AuthorizationErrorSchema = Type.Object(
  { error: Type.Literal('authentication_required') },
  { additionalProperties: false },
);

export type AuthorizationCapabilitiesRequest = Static<
  typeof AuthorizationCapabilitiesBodySchema
>;
export type AuthorizationCapabilitiesResponse = Static<
  typeof AuthorizationCapabilitiesResponseSchema
>;
export type AuthorizationErrorResponse = Static<typeof AuthorizationErrorSchema>;
