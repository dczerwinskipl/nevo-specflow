import { AuthorizationConfigurationError } from './errors.js';
import type {
  CapabilityId,
  ResourceDefinition,
  ResourceName,
  RoleAssignment,
  RoleId,
} from './types.js';
import {
  assertIdentifierSegment,
  assertNonEmpty,
  validateScope,
  validateSubject,
} from './validation.js';

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
    validateResourceDefinition(resource);

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
        throw new AuthorizationConfigurationError(`Unknown authorization role '${role}'.`);
      }
      return capabilities;
    },
  };
}

function validateResourceDefinition(resource: ResourceDefinition): void {
  assertIdentifierSegment(resource.name, 'Resource name');

  const mappedCapabilities = Object.values(resource.capabilities);
  const capabilityIds = [...resource.capabilityIds];

  if (
    mappedCapabilities.length !== capabilityIds.length ||
    new Set(mappedCapabilities).size !== mappedCapabilities.length ||
    new Set(capabilityIds).size !== capabilityIds.length ||
    mappedCapabilities.some((capability) => !capabilityIds.includes(capability)) ||
    capabilityIds.some((capability) => !mappedCapabilities.includes(capability))
  ) {
    throw new AuthorizationConfigurationError(
      `Resource '${resource.name}' capabilities and capabilityIds must contain the same unique capability ids.`,
    );
  }

  const prefix = `${resource.name}.`;
  for (const capability of capabilityIds) {
    if (!capability.startsWith(prefix) || capability.length === prefix.length) {
      throw new AuthorizationConfigurationError(
        `Capability '${capability}' does not belong to resource '${resource.name}'.`,
      );
    }
  }
}
