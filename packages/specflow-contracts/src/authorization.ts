import { Type, type Static } from 'typebox';

import { SessionAuthorization } from './session/authorization';
import { SettingsAuthorization } from './settings/authorization';
import { SpecAuthorization } from './spec/authorization';

export const SpecFlowAuthorizationResourceNameSchema = Type.Union([
  Type.Literal(SpecAuthorization.name),
  Type.Literal(SessionAuthorization.name),
  Type.Literal(SettingsAuthorization.name),
]);
export type SpecFlowAuthorizationResourceName = Static<
  typeof SpecFlowAuthorizationResourceNameSchema
>;

export const AuthorizationScopeSchema = Type.Record(
  Type.String({ minLength: 1 }),
  Type.String({ minLength: 1 }),
);

export const AuthorizationResourceQuerySchema = Type.Object(
  {
    name: SpecFlowAuthorizationResourceNameSchema,
    scope: AuthorizationScopeSchema,
  },
  { additionalProperties: false },
);
export type AuthorizationResourceQuery = Static<typeof AuthorizationResourceQuerySchema>;

export const AuthorizationCapabilitiesRequestSchema = Type.Object(
  {
    resource: AuthorizationResourceQuerySchema,
  },
  { additionalProperties: false },
);
export type AuthorizationCapabilitiesRequest = Static<
  typeof AuthorizationCapabilitiesRequestSchema
>;

export const AuthorizationCapabilitiesResponseSchema = Type.Object(
  {
    resource: AuthorizationResourceQuerySchema,
    capabilities: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type AuthorizationCapabilitiesResponse = Static<
  typeof AuthorizationCapabilitiesResponseSchema
>;

export const AuthorizationErrorResponseSchema = Type.Object(
  { error: Type.Literal('authentication_required') },
  { additionalProperties: false },
);
export type AuthorizationErrorResponse = Static<typeof AuthorizationErrorResponseSchema>;
