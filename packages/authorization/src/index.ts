export { AuthorizationConfigurationError } from './errors.js';
export {
  defineResource,
  type DefinedResource,
  type DefineResourceInput,
} from './resource.js';
export { createAuthorization } from './resolver.js';
export type {
  Authorization,
  AuthorizationDefinition,
  CanInput,
  CapabilityId,
  ResolveCapabilitiesInput,
  ResolveCapabilitiesResult,
  ResourceDefinition,
  ResourceName,
  ResourceQuery,
  RoleAssignment,
  RoleId,
  Scope,
  Subject,
} from './types.js';
