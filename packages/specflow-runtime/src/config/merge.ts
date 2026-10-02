function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies workstation-local overrides to project configuration.
 *
 * Objects merge recursively. Arrays and scalar values replace the project value in full.
 * The rule is deliberately small and deterministic so configuration precedence is inspectable.
 */
export function mergeRuntimeConfigValues(projectValue: unknown, localValue: unknown): unknown {
  if (!isRecord(projectValue) || !isRecord(localValue)) {
    return localValue;
  }

  const result: Record<string, unknown> = { ...projectValue };

  for (const [key, localChild] of Object.entries(localValue)) {
    result[key] = key in result ? mergeRuntimeConfigValues(result[key], localChild) : localChild;
  }

  return result;
}
