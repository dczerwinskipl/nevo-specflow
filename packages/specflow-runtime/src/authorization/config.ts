import type { Scope } from '@nevo/authorization';

import { RuntimeConfigError } from '../config/error.js';
import { nonEmptyString, onlyKeys, record } from '../config/value.js';
import { parseCanonicalAssignmentScope } from './assignment-scope.js';
import { isSpecFlowRole, type SpecFlowRole } from './roles.js';

export interface RuntimeAuthorizationAssignmentConfig {
  readonly userId: string;
  readonly role: SpecFlowRole;
  readonly scope: Scope;
}

export interface RuntimeAuthorizationConfig {
  readonly assignments: readonly RuntimeAuthorizationAssignmentConfig[];
}

const AUTHORIZATION_KEYS = new Set(['assignments']);
const ASSIGNMENT_KEYS = new Set(['userId', 'role', 'scope']);

export function parseAuthorizationConfig(
  value: unknown,
  knownUserIds: ReadonlySet<string>,
): RuntimeAuthorizationConfig {
  if (value === undefined) {
    return { assignments: [] };
  }

  const authorization = record(value, 'authorization');
  onlyKeys(authorization, AUTHORIZATION_KEYS, 'authorization');

  const rawAssignments = authorization.assignments ?? [];
  if (!Array.isArray(rawAssignments)) {
    throw new RuntimeConfigError('authorization.assignments must be an array.');
  }

  return {
    assignments: rawAssignments.map((rawAssignment, index) =>
      parseAssignment(rawAssignment, index, knownUserIds),
    ),
  };
}

function parseAssignment(
  value: unknown,
  index: number,
  knownUserIds: ReadonlySet<string>,
): RuntimeAuthorizationAssignmentConfig {
  const path = `authorization.assignments[${index}]`;
  const assignment = record(value, path);
  onlyKeys(assignment, ASSIGNMENT_KEYS, path);

  const userId = nonEmptyString(assignment.userId, `${path}.userId`);
  if (!knownUserIds.has(userId)) {
    throw new RuntimeConfigError(
      `${path}.userId references unknown project auth user '${userId}'.`,
    );
  }

  const role = nonEmptyString(assignment.role, `${path}.role`);
  if (!isSpecFlowRole(role)) {
    throw new RuntimeConfigError(`${path}.role references unknown role '${role}'.`);
  }

  return {
    userId,
    role,
    scope: parseCanonicalAssignmentScope(assignment.scope, `${path}.scope`),
  };
}
