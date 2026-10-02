import { AuthorizationConfigurationError } from './errors.js';
import type { Scope, Subject } from './types.js';

export function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === '') {
    throw new AuthorizationConfigurationError(`${name} must be a non-empty string.`);
  }
}

export function assertIdentifierSegment(value: string, name: string): void {
  assertNonEmpty(value, name);
  if (value.includes('.')) {
    throw new AuthorizationConfigurationError(`${name} must not contain '.'.`);
  }
}

export function validateSubject(subject: Subject, path: string): void {
  assertNonEmpty(subject.kind, `${path}.kind`);
  assertNonEmpty(subject.id, `${path}.id`);
}

export function validateScope(scope: Scope, path: string): void {
  for (const [key, value] of Object.entries(scope)) {
    assertNonEmpty(key, `${path} key`);
    assertNonEmpty(value, `${path}.${key}`);
  }
}
