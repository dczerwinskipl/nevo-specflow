import { AuthorizationConfigurationError } from './errors.js';
import { createAuthorizationRegistry } from './registry.js';
import { scopeMatches } from './scope.js';
import { subjectsEqual } from './subject.js';
import type {
  Authorization,
  AuthorizationDefinition,
  CapabilityId,
  ResolveCapabilitiesInput,
  ResolveCapabilitiesResult,
} from './types.js';
import { validateScope, validateSubject } from './validation.js';

export function createAuthorization(
  definition: AuthorizationDefinition,
): Authorization {
  const registry = createAuthorizationRegistry(
    definition.resources,
    definition.roles,
    definition.assignments,
  );

  const resolveCapabilities = (
    input: ResolveCapabilitiesInput,
  ): ResolveCapabilitiesResult => {
    validateSubject(input.subject, 'subject');
    validateScope(input.resource.scope, 'resource.scope');

    const allowedForResource = new Set(
      registry.capabilitiesForResource(input.resource.name),
    );
    const effective = new Set<CapabilityId>();

    for (const assignment of registry.assignments) {
      if (!subjectsEqual(assignment.subject, input.subject)) {
        continue;
      }

      if (!scopeMatches(assignment.scope, input.resource.scope)) {
        continue;
      }

      for (const capability of registry.capabilitiesForRole(assignment.role)) {
        if (allowedForResource.has(capability)) {
          effective.add(capability);
        }
      }
    }

    return { capabilities: [...effective] };
  };

  return {
    resolveCapabilities,

    can(input) {
      const resourceCapabilities = registry.capabilitiesForResource(
        input.resource.name,
      );

      if (!resourceCapabilities.includes(input.capability)) {
        throw new AuthorizationConfigurationError(
          `Capability '${input.capability}' does not belong to resource '${input.resource.name}'.`,
        );
      }

      return resolveCapabilities(input).capabilities.includes(input.capability);
    },

    resourceCapabilities(resourceName) {
      return [...registry.capabilitiesForResource(resourceName)];
    },
  };
}
