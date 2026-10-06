import { AuthorizationConfigurationError } from './errors';
import type { Scope, Subject } from './types';

export const IDENTIFIER_SEGMENT_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_-]*$';
export const SCOPE_VALUE_PATTERN = '\\S';

const IDENTIFIER_SEGMENT = new RegExp(IDENTIFIER_SEGMENT_PATTERN, 'u');

export function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === '') {
    throw new AuthorizationConfigurationError(`${name} must be a non-empty string.`);
  }
}

export function assertIdentifierSegment(value: string, name: string): void {
  if (!IDENTIFIER_SEGMENT.test(value)) {
    throw new AuthorizationConfigurationError(
      `${name} must contain only letters, digits, '_' or '-', and must start with a letter or digit.`,
    );
  }
}

export function validateSubject(subject: Subject, path: string): void {
  assertNonEmpty(subject.kind, `${path}.kind`);
  assertNonEmpty(subject.id, `${path}.id`);
}

export function validateScope(scope: Scope, path: string): void {
  for (const [key, value] of Object.entries(scope)) {
    assertIdentifierSegment(key, `${path} key`);
    assertNonEmpty(value, `${path}.${key}`);
  }
}
