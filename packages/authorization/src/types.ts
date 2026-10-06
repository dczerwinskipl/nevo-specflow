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

export interface HasCapabilityInAnyScopeInput {
  readonly subject: Subject;
  readonly resource: ResourceName;
  readonly capability: CapabilityId;
}

export interface AuthorizationDefinition {
  readonly resources: readonly ResourceDefinition[];
  readonly roles: Readonly<Record<RoleId, readonly CapabilityId[]>>;
  readonly assignments: readonly RoleAssignment[];
}

export interface Authorization {
  resolveCapabilities(input: ResolveCapabilitiesInput): ResolveCapabilitiesResult;
  can(input: CanInput): boolean;
  hasCapabilityInAnyScope(input: HasCapabilityInAnyScopeInput): boolean;
  resourceCapabilities(resourceName: ResourceName): readonly CapabilityId[];
}

export interface ResourceDefinition {
  readonly name: ResourceName;
  readonly actions: Readonly<Record<string, string>>;
  readonly capabilities: Readonly<Record<string, CapabilityId>>;
}
