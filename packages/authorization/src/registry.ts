import { AuthorizationConfigurationError } from './errors.js';
import type {
  CapabilityId,
  ResourceDefinition,
  ResourceName,
  RoleAssignment,
  RoleId,
} from './types.js';
import { validateScope, validateSubject, assertNonEmpty } from './validation.js';

export interface AuthorizationRegistry {
  readonly assignments: readonly RoleAssignment[];
  capabilitiesForResource(resourceName: ResourceName): readonly CapabilityId[];
  capabilitiesForRole(role: RoleId): readonly CapabilityId[];
}

export function createAuthorizationRegistry(
  resources: readonly ResourceDefinition[],
  rolesDefinition: Readonly<Record<RoleId, readonly CapabilityId[]>>,
  assignmentsDefinition: readonly RoleAssignment[],
): AuthorizationRegistry {
  const resourcesByName = new Map<ResourceName, readonly CapabilityId[]>();
  const capabilityOwners = new Map<CapabilityId, ResourceName>();

  for (const resource of resources) {
    if (resourcesByName.has(resource.name)) {
      throw new AuthorizationConfigurationError(
        `Duplicate authorization resource '${resource.name}'.`,
      );
    }

    for (const capability of resource.capabilityIds) {
      const existingOwner = capabilityOwners.get(capability);
      if (existingOwner) {
        throw new AuthorizationConfigurationError(
          `Capability '${capability}' is defined by both '${existingOwner}' and '${resource.name}'.`,
        );
      }
      capabilityOwners.set(capability, resource.name);
    }

    resourcesByName.set(resource.name, [...resource.capabilityIds]);
  }

  const roles = new Map<RoleId, readonly CapabilityId[]>();
  for (const [role, capabilities] of Object.entries(rolesDefinition)) {
    assertNonEmpty(role, 'Role id');

    const deduplicated = [...new Set(capabilities)];
    for (const capability of deduplicated) {
      if (!capabilityOwners.has(capability)) {
        throw new AuthorizationConfigurationError(
          `Role '${role}' references unknown capability '${capability}'.`,
        );
      }
    }

    roles.set(role, deduplicated);
  }

  const assignments = assignmentsDefinition.map((assignment, index) => {
    validateSubject(assignment.subject, `assignments[${index}].subject`);
    validateScope(assignment.scope, `assignments[${index}].scope`);

    if (!roles.has(assignment.role)) {
      throw new AuthorizationConfigurationError(
        `Assignment ${index} references unknown role '${assignment.role}'.`,
      );
    }

    return assignment;
  });

  return {
    assignments,

    capabilitiesForResource(resourceName) {
      const capabilities = resourcesByName.get(resourceName);
      if (!capabilities) {
        throw new AuthorizationConfigurationError(
          `Unknown authorization resource '${resourceName}'.`,
        );
      }
      return capabilities;
    },

    capabilitiesForRole(role) {
      const capabilities = roles.get(role);
      if (!capabilities) {
        throw new AuthorizationConfigurationError(
          `Unknown authorization role '${role}'.`,
        );
      }
      return capabilities;
    },
  };
}
