import type { ResourceDefinition, Scope } from '@nevo/authorization';
import type { FastifyRequest } from 'fastify';

import type {
  AuthorizationAnyScopeCapabilityCheck,
  ResourceCapability,
} from './request-authorization';

export function requireCapability<R extends ResourceDefinition>(input: {
  readonly resource: R;
  readonly capability: ResourceCapability<R>;
  readonly scope?: Scope | ((request: FastifyRequest) => Scope | Promise<Scope>);
}) {
  return async (request: FastifyRequest): Promise<void> => {
    request.authz.requireAccess();

    const scope =
      typeof input.scope === 'function' ? await input.scope(request) : (input.scope ?? {});

    request.authz.require({
      resource: input.resource,
      capability: input.capability,
      scope,
    });
  };
}

export function requireCapabilityInAnyScope<R extends ResourceDefinition>(
  input: AuthorizationAnyScopeCapabilityCheck<R>,
) {
  return (request: FastifyRequest): Promise<void> => {
    request.authz.requireCapabilityInAnyScope(input);
    return Promise.resolve();
  };
}
