import { AuthorizationConfigurationError } from './errors';
import type {
  CapabilityId,
  ResourceDefinition,
  ResourceName,
  RoleAssignment,
  RoleId,
} from './types';
import { assertIdentifierSegment, validateScope, validateSubject } from './validation';

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
    const resourceCapabilities = validateResourceDefinition(resource);

    if (resourcesByName.has(resource.name)) {
      throw new AuthorizationConfigurationError(
        `Duplicate authorization resource '${resource.name}'.`,
      );
    }

    for (const capability of resourceCapabilities) {
      const existingOwner = capabilityOwners.get(capability);
      if (existingOwner) {
        throw new AuthorizationConfigurationError(
          `Capability '${capability}' is defined by both '${existingOwner}' and '${resource.name}'.`,
        );
      }
      capabilityOwners.set(capability, resource.name);
    }

    resourcesByName.set(resource.name, resourceCapabilities);
  }

  const roles = new Map<RoleId, readonly CapabilityId[]>();
  for (const [role, capabilities] of Object.entries(rolesDefinition)) {
    assertIdentifierSegment(role, 'Role id');

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

    return {
      subject: { ...assignment.subject },
      role: assignment.role,
      scope: { ...assignment.scope },
    };
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

function validateResourceDefinition(resource: ResourceDefinition): readonly CapabilityId[] {
  assertIdentifierSegment(resource.name, 'Resource name');

  const actionKeys = Object.keys(resource.actions);
  const capabilityKeys = Object.keys(resource.capabilities);
  if (
    actionKeys.length !== capabilityKeys.length ||
    actionKeys.some((key) => !Object.hasOwn(resource.capabilities, key)) ||
    capabilityKeys.some((key) => !Object.hasOwn(resource.actions, key))
  ) {
    throw new AuthorizationConfigurationError(
      `Resource '${resource.name}' actions and capabilities must contain the same keys.`,
    );
  }

  const capabilities: CapabilityId[] = [];
  const seen = new Set<CapabilityId>();

  for (const key of actionKeys) {
    const action = resource.actions[key];
    const capability = resource.capabilities[key];
    if (action === undefined || capability === undefined) {
      throw new AuthorizationConfigurationError(
        `Resource '${resource.name}' has an incomplete capability definition for '${key}'.`,
      );
    }

    assertIdentifierSegment(action, `Capability action '${key}'`);
    const expected = `${resource.name}.${action}`;
    if (capability !== expected) {
      throw new AuthorizationConfigurationError(
        `Capability '${capability}' must equal '${expected}' for resource '${resource.name}'.`,
      );
    }
    if (seen.has(capability)) {
      throw new AuthorizationConfigurationError(
        `Resource '${resource.name}' defines duplicate capability '${capability}'.`,
      );
    }

    seen.add(capability);
    capabilities.push(capability);
  }

  return capabilities;
}
