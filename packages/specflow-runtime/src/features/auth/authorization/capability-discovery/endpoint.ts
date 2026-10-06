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
        body: requestSchema,
        response: {
          200: responseSchema,
          401: AuthenticationRequiredErrorResponseSchema,
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
