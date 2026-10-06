import { AuthorizationConfigurationError } from './errors';
import { createAuthorizationRegistry } from './registry';
import { scopeCovers } from './scope';
import { subjectsEqual } from './subject';
import type {
  Authorization,
  AuthorizationDefinition,
  CapabilityId,
  HasCapabilityInAnyScopeInput,
  ResolveCapabilitiesInput,
  ResolveCapabilitiesResult,
} from './types';
import { validateScope, validateSubject } from './validation';

export function createAuthorization(definition: AuthorizationDefinition): Authorization {
  const registry = createAuthorizationRegistry(
    definition.resources,
    definition.roles,
    definition.assignments,
  );

  const assertCapabilityResource = (resourceName: string, capability: CapabilityId): void => {
    const resourceCapabilities = registry.capabilitiesForResource(resourceName);
    if (!resourceCapabilities.includes(capability)) {
      throw new AuthorizationConfigurationError(
        `Capability '${capability}' does not belong to resource '${resourceName}'.`,
      );
    }
  };

  const resolveCapabilities = (input: ResolveCapabilitiesInput): ResolveCapabilitiesResult => {
    validateSubject(input.subject, 'subject');
    validateScope(input.resource.scope, 'resource.scope');

    const allowedForResource = new Set(registry.capabilitiesForResource(input.resource.name));
    const effective = new Set<CapabilityId>();

    for (const assignment of registry.assignments) {
      if (!subjectsEqual(assignment.subject, input.subject)) {
        continue;
      }

      if (!scopeCovers(assignment.scope, input.resource.scope)) {
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

  const hasCapabilityInAnyScope = (input: HasCapabilityInAnyScopeInput): boolean => {
    validateSubject(input.subject, 'subject');
    assertCapabilityResource(input.resource, input.capability);

    return registry.assignments.some(
      (assignment) =>
        subjectsEqual(assignment.subject, input.subject) &&
        registry.capabilitiesForRole(assignment.role).includes(input.capability),
    );
  };

  return {
    resolveCapabilities,

    can(input) {
      assertCapabilityResource(input.resource.name, input.capability);
      return resolveCapabilities(input).capabilities.includes(input.capability);
    },

    hasCapabilityInAnyScope,

    resourceCapabilities(resourceName) {
      return [...registry.capabilitiesForResource(resourceName)];
    },
  };
}
