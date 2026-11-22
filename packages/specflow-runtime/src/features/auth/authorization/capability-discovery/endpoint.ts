import type { ResourceDefinition } from '@nevo/authorization';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  type AuthenticationRequiredErrorResponse,
} from '@nevo/specflow-contracts/authorization';
import {
  createCapabilityDiscoveryRequestSchema,
  createCapabilityDiscoveryResponseSchema,
  type CapabilityDiscoveryRequest,
  type CapabilityDiscoveryResponse,
} from '@nevo/specflow-contracts/authorization/capability-discovery';
import { contractRef } from '../../../../server/shared-contracts';

export interface CapabilityDiscoveryEndpointOptions {
  readonly authorizationResources: readonly ResourceDefinition[];
}

export const capabilityDiscoveryEndpoint: FastifyPluginCallback<
  CapabilityDiscoveryEndpointOptions
> = (app, options, done) => {
  const resourcesByName = new Map(
    options.authorizationResources.map((resource) => [resource.name, resource]),
  );
  const requestSchema = createCapabilityDiscoveryRequestSchema(options.authorizationResources);
  const responseSchema = createCapabilityDiscoveryResponseSchema(options.authorizationResources);
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.post<{
    Body: CapabilityDiscoveryRequest;
    Reply: CapabilityDiscoveryResponse | AuthenticationRequiredErrorResponse;
  }>(
    '/api/authorization/capabilities',
    {
      schema: {
        tags: ['Authorization'],
        summary: 'Resolve the capabilities of the caller on a resource',
        description:
          'Returns the effective action booleans for the current authenticated or trusted-local caller and the requested resource/scope. The caller identity is resolved by Runtime; it is never accepted from the request. Omitted scope means the global `{}` target. Every registered action appears as true or false; lack of permission is a normal 200 response with false, not 403. A global assignment covers a narrower requested scope, but a narrower grant does not cover the global target. When access control is disabled, all registered actions return true. Results are advisory UI data, not authorization evidence for later operations: each mutation must enforce independently using trusted scope. Responses use Cache-Control: no-store.',
        body: requestSchema,
        response: {
          200: responseSchema,
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
        },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');

      const resource = resourcesByName.get(request.body.resource.name);
      if (!resource) {
        throw new Error('Capability discovery resource passed validation but is not registered.');
      }

      const scope = request.body.resource.scope ?? {};
      const response: CapabilityDiscoveryResponse = {
        resource: {
          name: resource.name,
          scope,
        },
        capabilities: request.authz.resolveCapabilities({ resource, scope }),
      };

      return response;
    },
  );

  done();
};
