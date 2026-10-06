export { AuthorizationConfigurationError } from './errors';
export { defineResource, type DefinedResource, type DefineResourceInput } from './resource';
export { createAuthorization } from './resolver';
export { scopeCovers } from './scope';
export { IDENTIFIER_SEGMENT_PATTERN, SCOPE_VALUE_PATTERN } from './validation';
export type {
  Authorization,
  AuthorizationDefinition,
  CanInput,
  CapabilityId,
  HasCapabilityInAnyScopeInput,
  ResolveCapabilitiesInput,
  ResolveCapabilitiesResult,
  ResourceDefinition,
  ResourceName,
  ResourceQuery,
  RoleAssignment,
  RoleId,
  Scope,
  Subject,
} from './types';
