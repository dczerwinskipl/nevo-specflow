import type { Scope } from '@nevo/authorization';

import { RuntimeConfigError } from '../config/error.js';
import {
  childRecord,
  isRecord,
  nonEmptyString,
  onlyKeys,
  record,
} from '../config/value.js';
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
const SCOPE_KEYS = new Set(['projectId', 'specId', 'sessionId']);

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
    assignments: rawAssignments.map((rawAssignment, index) => {
      const path = `authorization.assignments[${index}]`;
      const assignment = record(rawAssignment, path);
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
    }),
  };
}

export function validateProjectAuthorizationSource(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const auth = childRecord(value, 'auth');
  const users = childRecord(auth, 'users');
  const projectUserIds = new Set(Object.keys(users ?? {}));
  parseAuthorizationConfig(value.authorization, projectUserIds);
}

export function assertNoLocalAuthorization(value: unknown): void {
  if (isRecord(value) && Object.hasOwn(value, 'authorization')) {
    throw new RuntimeConfigError(
      'authorization is project-only and must not be defined in .nevo-local configuration.',
    );
  }
}

function parseCanonicalAssignmentScope(value: unknown, path: string): Scope {
  const scope = record(value, path);
  onlyKeys(scope, SCOPE_KEYS, path);

  const parsed: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(scope)) {
    parsed[key] = nonEmptyString(rawValue, `${path}.${key}`);
  }

  const hasProject = Object.hasOwn(parsed, 'projectId');
  const hasSpec = Object.hasOwn(parsed, 'specId');
  const hasSession = Object.hasOwn(parsed, 'sessionId');

  if ((hasSpec && !hasProject) || (hasSession && (!hasProject || !hasSpec))) {
    throw new RuntimeConfigError(
      `${path} must use a canonical parent chain: {}, { projectId }, { projectId, specId }, or { projectId, specId, sessionId }.`,
    );
  }

  return parsed;
}
