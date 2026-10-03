import {
  assertLocalAuthConfigOwnership,
  assertProjectAuthConfigOwnership,
} from '../auth/authentication/config/ownership';
import {
  assertLocalServerConfigOwnership,
  assertProjectServerConfigOwnership,
} from '../server/config-ownership';
import { childRecord, onlyKeys, record } from './value';

const PROJECT_RUNTIME_KEYS = new Set(['server', 'auth', 'authorization']);
const LOCAL_RUNTIME_KEYS = new Set(['server', 'auth']);

export function assertProjectRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, PROJECT_RUNTIME_KEYS, 'runtime');
  assertProjectServerConfigOwnership(childRecord(runtime, 'server'));
  assertProjectAuthConfigOwnership(childRecord(runtime, 'auth'));
}

export function assertLocalRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, LOCAL_RUNTIME_KEYS, 'runtime');
  assertLocalServerConfigOwnership(childRecord(runtime, 'server'));
  assertLocalAuthConfigOwnership(childRecord(runtime, 'auth'));
}
