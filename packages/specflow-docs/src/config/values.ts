// Shape checks shared by the configuration namespace parsers of this package.

import { DocsConfigError } from '../errors';

export type ConfigRecord = Record<string, unknown>;

export function record(value: unknown, path: string): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DocsConfigError(`${path} must be an object.`);
  }

  return value as ConfigRecord;
}

export function onlyKeys(value: ConfigRecord, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new DocsConfigError(`Unknown configuration key '${path}.${key}'.`);
    }
  }
}

/**
 * A relative directory path (below the project root or below `docs.root`): `/`-separated, no
 * empty, `.` or `..` segments, not absolute. A single trailing slash is accepted and removed.
 */
export function relativeDirectory(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocsConfigError(`${path} must be a non-empty string.`);
  }

  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  const segments = normalized.split('/');
  if (
    normalized.includes('\\') ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new DocsConfigError(
      `${path} must be a relative directory path with '/' separators and no '.' or '..' segments (got '${value}').`,
    );
  }

  return normalized;
}
