import { Type, type Static } from 'typebox';

import {
  SessionAuthorization,
  SettingsAuthorization,
  SpecAuthorization,
} from '@nevo/specflow-contracts';
import type {
  AuthorizationCapabilitiesRequest,
  AuthorizationCapabilitiesResponse,
  AuthorizationErrorResponse,
} from '@nevo/specflow-contracts/authorization';
export type {
  AuthorizationCapabilitiesRequest,
  AuthorizationCapabilitiesResponse,
  AuthorizationErrorResponse,
  AuthorizationResourceQuery,
  SpecFlowAuthorizationResourceName,
} from '@nevo/specflow-contracts/authorization';

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

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Assert<Condition extends true> = Condition;

export type AuthorizationSchemaContractAssertions = [
  Assert<
    IsAssignable<Static<typeof AuthorizationCapabilitiesBodySchema>, AuthorizationCapabilitiesRequest>
  >,
  Assert<
    IsAssignable<AuthorizationCapabilitiesRequest, Static<typeof AuthorizationCapabilitiesBodySchema>>
  >,
  Assert<
    IsAssignable<
      Static<typeof AuthorizationCapabilitiesResponseSchema>,
      AuthorizationCapabilitiesResponse
    >
  >,
  Assert<
    IsAssignable<
      AuthorizationCapabilitiesResponse,
      Static<typeof AuthorizationCapabilitiesResponseSchema>
    >
  >,
  Assert<IsAssignable<Static<typeof AuthorizationErrorSchema>, AuthorizationErrorResponse>>,
  Assert<IsAssignable<AuthorizationErrorResponse, Static<typeof AuthorizationErrorSchema>>>,
];
