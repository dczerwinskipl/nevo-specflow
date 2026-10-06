export {
  AuthLoginMethodsSchema,
  AuthSessionMethodSchema,
  AuthSessionResponseSchema,
  AuthUserSchema,
  OIDC_PROVIDER_ID_MAX_LENGTH,
  OIDC_PROVIDER_NAME_MAX_LENGTH,
  OIDC_RETURN_TO_MAX_LENGTH,
  OidcCallbackErrorCodeSchema,
  OidcCallbackErrorResponseSchema,
  OidcStartErrorResponseSchema,
  OidcStartRequestSchema,
  OidcStartSuccessResponseSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_USERNAME_MAX_LENGTH,
  PasswordLoginErrorResponseSchema,
  PasswordLoginRequestSchema,
} from './authentication';
export type {
  AuthLoginMethods,
  AuthSessionMethod,
  AuthSessionResponse,
  AuthUser,
  OidcCallbackErrorCode,
  OidcCallbackErrorResponse,
  OidcStartErrorResponse,
  OidcStartRequest,
  OidcStartSuccessResponse,
  PasswordLoginErrorResponse,
  PasswordLoginRequest,
} from './authentication';

export {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
  AuthorizationScopeSchema,
  capabilityProjectionSchema,
} from './authorization';
export type {
  AuthenticationRequiredErrorResponse,
  AuthorizationErrorResponse,
  AuthorizationForbiddenErrorResponse,
  AuthorizationScope,
  CapabilityProjection,
  WithCapabilities,
} from './authorization';

export {
  createCapabilityDiscoveryRequestSchema,
  createCapabilityDiscoveryResponseSchema,
} from './authorization/capability-discovery';
export type {
  CapabilityDiscoveryRequest,
  CapabilityDiscoveryResponse,
  CapabilityDiscoveryResponseFor,
} from './authorization/capability-discovery';

export { SessionCapabilities } from './sessions';
export { SettingsCapabilities } from './settings';
export { SpecCapabilities } from './specs';
