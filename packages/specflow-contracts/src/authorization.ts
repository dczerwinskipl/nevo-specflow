import type { CapabilityId, Scope } from '@nevo/authorization';

import type { SessionAuthorization } from './session/authorization.js';
import type { SettingsAuthorization } from './settings/authorization.js';
import type { SpecAuthorization } from './spec/authorization.js';

export type SpecFlowAuthorizationResourceName =
  | typeof SpecAuthorization.name
  | typeof SessionAuthorization.name
  | typeof SettingsAuthorization.name;

export interface AuthorizationResourceQuery {
  readonly name: SpecFlowAuthorizationResourceName;
  readonly scope: Scope;
}

export interface AuthorizationCapabilitiesRequest {
  readonly resource: AuthorizationResourceQuery;
}

export interface AuthorizationCapabilitiesResponse {
  readonly resource: AuthorizationResourceQuery;
  readonly capabilities: readonly CapabilityId[];
}

export interface AuthorizationErrorResponse {
  readonly error: 'authentication_required';
}
