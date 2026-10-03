import { RuntimeConfigError } from '../config/error.js';
import { childRecord, isRecord } from '../config/value.js';
import { parseAuthorizationConfig } from './config.js';

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
      'authorization is project-only and must not be defined in .nevo/local/config.yaml.',
    );
  }
}
