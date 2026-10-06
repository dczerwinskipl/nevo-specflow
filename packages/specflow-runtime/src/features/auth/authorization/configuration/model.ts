import type { Scope } from '@nevo/authorization';

import type { SpecFlowRoleId } from '../roles';

export interface RuntimeAuthorizationAssignmentConfig {
  readonly userId: string;
  readonly role: SpecFlowRoleId;
  readonly scope: Scope;
}

export interface RuntimeAuthorizationConfig {
  readonly assignments: readonly RuntimeAuthorizationAssignmentConfig[];
}
