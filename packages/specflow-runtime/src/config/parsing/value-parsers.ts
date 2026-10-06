import { RuntimeConfigError } from './runtime-config-error';

export type ConfigRecord = Record<string, unknown>;

export function record(value: unknown, path: string): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RuntimeConfigError(`${path} must be an object.`);
  }
  return value as ConfigRecord;
}

export function childRecord(
  value: ConfigRecord | undefined,
  key: string,
): ConfigRecord | undefined {
  if (!value) return undefined;

  const child = value[key];
  return isRecord(child) ? child : undefined;
}

export function isRecord(value: unknown): value is ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function onlyKeys(value: ConfigRecord, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new RuntimeConfigError(`Unknown configuration key '${path}.${key}'.`);
    }
  }
}

export function nonEmptyKey(value: string, path: string): void {
  if (value.trim() === '') {
    throw new RuntimeConfigError(`${path} must not contain empty keys.`);
  }
}

export function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeConfigError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

export function opaqueNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeConfigError(`${path} must be a non-empty string.`);
  }
  return value;
}

export function optionalNonEmptyString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, path);
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RuntimeConfigError(`${path} must be a boolean.`);
  }
  return value;
}

export function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RuntimeConfigError(`${path} must be an integer.`);
  }
  return value;
}

export function absoluteHttpsUrl(value: unknown, path: string): string {
  const raw = nonEmptyString(value, path);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeConfigError(`${path} must be an absolute HTTPS URL.`);
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new RuntimeConfigError(
      `${path} must be an absolute HTTPS URL without credentials, query, or fragment.`,
    );
  }

  return raw;
}
