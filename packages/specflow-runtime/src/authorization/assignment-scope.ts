import type { Scope } from '@nevo/authorization';

import { RuntimeConfigError } from '../config/error.js';
import { nonEmptyString, onlyKeys, record } from '../config/value.js';

const SCOPE_KEYS = new Set(['projectId', 'specId', 'sessionId']);

export function parseCanonicalAssignmentScope(
  value: unknown,
  path: string,
): Scope {
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
