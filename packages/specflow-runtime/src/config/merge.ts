import { AUTH_CONFIG_REPLACE_PATHS } from '../auth/config.js';

const REPLACE_PATHS = new Set<string>(AUTH_CONFIG_REPLACE_PATHS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies workstation-local overrides to project configuration.
 *
 * Objects merge recursively and scalar values replace the project value. Feature-owned
 * security-sensitive maps are composed here as replacement paths so removing a local
 * entry also revokes it.
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
