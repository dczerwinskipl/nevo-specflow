const REPLACE_PATHS = new Set([
  'auth.providers.password.accounts',
  'auth.providers.oidc.allowedEmails',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies workstation-local overrides to project configuration.
 *
 * Objects merge recursively and scalar values replace the project value. Security-sensitive
 * credential/access maps are replaced in full so removing a local entry also revokes it.
 */
export function mergeRuntimeConfigValues(projectValue: unknown, localValue: unknown): unknown {
  return mergeValue(projectValue, localValue, []);
}

function mergeValue(projectValue: unknown, localValue: unknown, path: readonly string[]): unknown {
  if (!isRecord(projectValue) || !isRecord(localValue) || REPLACE_PATHS.has(path.join('.'))) {
    return localValue;
  }

  const result: Record<string, unknown> = { ...projectValue };

  for (const [key, localChild] of Object.entries(localValue)) {
    result[key] = key in result ? mergeValue(result[key], localChild, [...path, key]) : localChild;
  }

  return result;
}
