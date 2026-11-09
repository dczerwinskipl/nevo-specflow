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
