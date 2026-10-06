import {
  assertLocalAuthenticationSource,
  assertProjectAuthenticationSource,
} from '../features/auth';
import {
  assertLocalServerConfigOwnership,
  assertProjectServerConfigOwnership,
} from '../server/config-ownership';
import { childRecord, onlyKeys, record } from './parsing/value-parsers';

const PROJECT_RUNTIME_KEYS = new Set(['server', 'authentication', 'authorization']);
const LOCAL_RUNTIME_KEYS = new Set(['server', 'authentication']);

export function assertProjectRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, PROJECT_RUNTIME_KEYS, 'runtime');
  assertProjectServerConfigOwnership(childRecord(runtime, 'server'));
  assertProjectAuthenticationSource(childRecord(runtime, 'authentication'));
}

export function assertLocalRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, LOCAL_RUNTIME_KEYS, 'runtime');
  assertLocalServerConfigOwnership(childRecord(runtime, 'server'));
  assertLocalAuthenticationSource(childRecord(runtime, 'authentication'));
}
