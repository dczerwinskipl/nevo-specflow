import type { ResourceDefinition } from '@nevo/authorization';
import { Type } from 'typebox';

import {
  AuthorizationScopeSchema,
  capabilityProjectionSchema,
  type AuthorizationScope,
  type CapabilityProjection,
} from './index';

export interface CapabilityDiscoveryRequest {
  readonly resource: {
    readonly name: string;
    readonly scope?: AuthorizationScope;
  };
}

export interface CapabilityDiscoveryResponse<R extends ResourceDefinition = ResourceDefinition> {
  readonly resource: {
    readonly name: R['name'];
    readonly scope: AuthorizationScope;
  };
  readonly capabilities: CapabilityProjection<R>;
}

export type CapabilityDiscoveryResponseFor<R extends ResourceDefinition> =
  CapabilityDiscoveryResponse<R>;

export function createCapabilityDiscoveryRequestSchema(
  authorizationResources: readonly ResourceDefinition[],
) {
  assertResources(authorizationResources);

  const resourceNameSchema = Type.Union(
    authorizationResources.map((resource) => Type.Literal(resource.name)),
  );

  return Type.Object(
    {
      resource: Type.Object(
        {
          name: resourceNameSchema,
          scope: Type.Optional(AuthorizationScopeSchema),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  );
}

export function createCapabilityDiscoveryResponseSchema(
  authorizationResources: readonly ResourceDefinition[],
) {
  assertResources(authorizationResources);

  return Type.Union(
    authorizationResources.map((resource) =>
      Type.Object(
        {
          resource: Type.Object(
            {
              name: Type.Literal(resource.name),
              scope: AuthorizationScopeSchema,
            },
            { additionalProperties: false },
          ),
          capabilities: capabilityProjectionSchema(resource),
        },
        { additionalProperties: false },
      ),
    ),
  );
}

function assertResources(authorizationResources: readonly ResourceDefinition[]): void {
  if (authorizationResources.length === 0) {
    throw new Error('Capability discovery requires at least one registered resource.');
  }
}
