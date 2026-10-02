export type CapabilityId = string;
export type RoleId = string;
export type ResourceName = string;
export type Scope = Readonly<Record<string, string>>;

export interface Subject {
  readonly kind: string;
  readonly id: string;
}

export interface RoleAssignment {
  readonly subject: Subject;
  readonly role: RoleId;
  readonly scope: Scope;
}

type CapabilityMap = Readonly<Record<string, string>>;

type QualifiedCapabilities<
  Name extends string,
  Capabilities extends CapabilityMap,
> = Readonly<{
  [Key in keyof Capabilities]: `${Name}.${Extract<Capabilities[Key], string>}`;
}>;

export interface ResourceDefinition<
  Name extends string = string,
  Capabilities extends CapabilityMap = CapabilityMap,
> {
  readonly name: Name;
  readonly capabilities: QualifiedCapabilities<Name, Capabilities>;
  readonly capabilityIds: readonly CapabilityId[];
}

export interface DefineResourceInput<
  Name extends string,
  Capabilities extends CapabilityMap,
> {
  readonly name: Name;
  readonly capabilities: Capabilities;
}

export function defineResource<
  const Name extends string,
  const Capabilities extends CapabilityMap,
>(
  input: DefineResourceInput<Name, Capabilities>,
): ResourceDefinition<Name, Capabilities> {
  assertSegment(input.name, 'Resource name');

  const qualified: Record<string, string> = {};
  const capabilityIds: string[] = [];
  const seen = new Set<string>();

  for (const [key, action] of Object.entries(input.capabilities)) {
    assertSegment(action, `Capability action '${key}'`);
    const capability = `${input.name}.${action}`;
    if (seen.has(capability)) {
      throw new AuthorizationConfigurationError(
        `Resource '${input.name}' defines duplicate capability '${capability}'.`,
      );
    }
    seen.add(capability);
    qualified[key] = capability;
    capabilityIds.push(capability);
  }

  return {
    name: input.name,
    capabilities: qualified as QualifiedCapabilities<Name, Capabilities>,
    capabilityIds,
  };
}

export interface AuthorizationDefinition {
  readonly resources: readonly ResourceDefinition[];
  readonly roles: Readonly<Record<RoleId, readonly CapabilityId[]>>;
  readonly assignments: readonly RoleAssignment[];
}

export interface ResourceQuery {
  readonly name: ResourceName;
  readonly scope: Scope;
}

export interface ResolveCapabilitiesInput {
  readonly subject: Subject;
  readonly resource: ResourceQuery;
}

export interface ResolveCapabilitiesResult {
  readonly capabilities: readonly CapabilityId[];
}

export interface CanInput extends ResolveCapabilitiesInput {
  readonly capability: CapabilityId;
}

export interface Authorization {
  resolveCapabilities(input: ResolveCapabilitiesInput): ResolveCapabilitiesResult;
  can(input: CanInput): boolean;
  resourceCapabilities(resourceName: ResourceName): readonly CapabilityId[];
}

export class AuthorizationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationConfigurationError';
  }
}

export function createAuthorization(definition: AuthorizationDefinition): Authorization {
  const resources = new Map<ResourceName, readonly CapabilityId[]>();
  const capabilityOwners = new Map<CapabilityId, ResourceName>();

  for (const resource of definition.resources) {
    if (resources.has(resource.name)) {
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

    resources.set(resource.name, [...resource.capabilityIds]);
  }

  const roles = new Map<RoleId, readonly CapabilityId[]>();
  for (const [role, capabilities] of Object.entries(definition.roles)) {
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

  const assignments = definition.assignments.map((assignment, index) => {
    validateSubject(assignment.subject, `assignments[${index}].subject`);
    validateScope(assignment.scope, `assignments[${index}].scope`);
    if (!roles.has(assignment.role)) {
      throw new AuthorizationConfigurationError(
        `Assignment ${index} references unknown role '${assignment.role}'.`,
      );
    }
    return assignment;
  });

  function requireResource(name: ResourceName): readonly CapabilityId[] {
    const capabilities = resources.get(name);
    if (!capabilities) {
      throw new AuthorizationConfigurationError(
        `Unknown authorization resource '${name}'.`,
      );
    }
    return capabilities;
  }

  const resolveCapabilities = (
    input: ResolveCapabilitiesInput,
  ): ResolveCapabilitiesResult => {
    validateSubject(input.subject, 'subject');
    validateScope(input.resource.scope, 'resource.scope');

    const resourceCapabilities = new Set(requireResource(input.resource.name));
    const effective = new Set<CapabilityId>();

    for (const assignment of assignments) {
      if (!sameSubject(assignment.subject, input.subject)) {
        continue;
      }
      if (!scopeMatches(assignment.scope, input.resource.scope)) {
        continue;
      }

      for (const capability of roles.get(assignment.role) ?? []) {
        if (resourceCapabilities.has(capability)) {
          effective.add(capability);
        }
      }
    }

    return { capabilities: [...effective] };
  };

  return {
    resolveCapabilities,

    can(input) {
      const resourceCapabilities = requireResource(input.resource.name);
      if (!resourceCapabilities.includes(input.capability)) {
        throw new AuthorizationConfigurationError(
          `Capability '${input.capability}' does not belong to resource '${input.resource.name}'.`,
        );
      }
      return resolveCapabilities(input).capabilities.includes(input.capability);
    },

    resourceCapabilities(resourceName) {
      return [...requireResource(resourceName)];
    },
  };
}

function sameSubject(left: Subject, right: Subject): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function scopeMatches(assignment: Scope, requested: Scope): boolean {
  return Object.entries(assignment).every(([key, value]) => requested[key] === value);
}

function validateSubject(subject: Subject, path: string): void {
  assertNonEmpty(subject.kind, `${path}.kind`);
  assertNonEmpty(subject.id, `${path}.id`);
}

function validateScope(scope: Scope, path: string): void {
  for (const [key, value] of Object.entries(scope)) {
    assertNonEmpty(key, `${path} key`);
    assertNonEmpty(value, `${path}.${key}`);
  }
}

function assertSegment(value: string, name: string): void {
  assertNonEmpty(value, name);
  if (value.includes('.')) {
    throw new AuthorizationConfigurationError(`${name} must not contain '.'.`);
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === '') {
    throw new AuthorizationConfigurationError(`${name} must be a non-empty string.`);
  }
}
