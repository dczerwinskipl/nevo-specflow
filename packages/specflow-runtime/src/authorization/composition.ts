import { createAuthorization, type Authorization } from '@nevo/authorization';
import {
  SessionAuthorization,
  SettingsAuthorization,
  SpecAuthorization,
} from '@nevo/specflow-contracts';

import type { RuntimeAuthorizationConfig } from './config.js';
import { SPEC_FLOW_ROLES } from './roles.js';

export const SPEC_FLOW_RESOURCES = [
  SpecAuthorization,
  SessionAuthorization,
  SettingsAuthorization,
] as const;

export function createSpecFlowAuthorization(
  config: RuntimeAuthorizationConfig,
): Authorization {
  return createAuthorization({
    resources: SPEC_FLOW_RESOURCES,
    roles: SPEC_FLOW_ROLES,
    assignments: config.assignments.map((assignment) => ({
      subject: { kind: 'user', id: assignment.userId },
      role: assignment.role,
      scope: assignment.scope,
    })),
  });
}
