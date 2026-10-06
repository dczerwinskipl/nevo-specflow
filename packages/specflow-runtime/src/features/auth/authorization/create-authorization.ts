import {
  createAuthorization,
  type Authorization,
  type CapabilityId,
  type ResourceDefinition,
} from '@nevo/authorization';

import type { RuntimeAuthorizationConfig } from './configuration/model';
import type { SpecFlowRoleId } from './roles';

export interface CreateRuntimeAuthorizationOptions {
  readonly config: RuntimeAuthorizationConfig;
  readonly resources: readonly ResourceDefinition[];
  readonly roles: Readonly<Record<SpecFlowRoleId, readonly CapabilityId[]>>;
}

export function createRuntimeAuthorization(
  options: CreateRuntimeAuthorizationOptions,
): Authorization {
  return createAuthorization({
    resources: options.resources,
    roles: options.roles,
    assignments: options.config.assignments.map((assignment) => ({
      subject: { kind: 'user', id: assignment.userId },
      role: assignment.role,
      scope: assignment.scope,
    })),
  });
}
