import { RuntimeConfigError } from '../../../../config/parsing/runtime-config-error';
import { childRecord, isRecord } from '../../../../config/parsing/value-parsers';
import { parseAuthorizationConfig } from './parse';

export function validateProjectAuthorizationSource(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const authentication = childRecord(value, 'authentication');
  const users = childRecord(authentication, 'users');
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
