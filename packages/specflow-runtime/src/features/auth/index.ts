export {
  createAuthFeature,
  type AuthFeature,
  type AuthFeatureDependencies,
  type CreateAuthFeatureOptions,
} from './feature';

export { requireCapability, requireCapabilityInAnyScope } from './authorization/guards';
export type {
  AuthorizationAnyScopeCapabilityCheck,
  AuthorizationCapabilityCheck,
  AuthorizationTarget,
  AuthorizationTargets,
  RequestAuthorization,
  ResourceCapability,
  WithCapabilities,
} from './authorization/request-authorization';

export type { SpecFlowRoleId } from './authorization/roles';

export {
  type AuthenticationMode,
  type RuntimeAuthenticationConfig,
  type RuntimeOidcProviderConfig,
  type RuntimeOidcProvidersConfig,
  type RuntimePasswordAccountConfig,
  type RuntimePasswordProviderConfig,
  type RuntimeUserConfig,
} from './authentication/configuration/model';
export { parseAuthenticationConfig } from './authentication/configuration/parse';
export { validateAuthenticationRuntimeContext } from './authentication/configuration/runtime-policy';
export {
  assertLocalAuthenticationSource,
  assertProjectAuthenticationSource,
} from './authentication/configuration/source-policy';
export {
  setupAuthentication,
  type AuthenticationSetupOptions,
  type AuthenticationSetupResult,
} from './authentication/configuration/setup';
export type {
  RuntimeAuthorizationAssignmentConfig,
  RuntimeAuthorizationConfig,
} from './authorization/configuration/model';
export { parseAuthorizationConfig } from './authorization/configuration/parse';
export {
  assertNoLocalAuthorization,
  validateProjectAuthorizationSource,
} from './authorization/configuration/source-policy';
export { createAuthorizationSetup } from './authorization/configuration/setup';

export { AuthenticationRequiredError, AuthorizationForbiddenError } from './authorization/errors';

export { AUTHENTICATION_CONFIG_REPLACE_PATHS } from './authentication/configuration/merge-policy';
export { createAuthCommand, type AuthCommandContext } from './cli';
