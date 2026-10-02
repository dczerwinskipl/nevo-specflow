import {
  assertLocalAuthConfigOwnership,
  assertProjectAuthConfigOwnership,
} from '../auth/config.js';
import {
  assertLocalServerConfigOwnership,
  assertProjectServerConfigOwnership,
} from '../server/config-ownership.js';
import { childRecord, onlyKeys, record } from './value.js';

const RUNTIME_KEYS = new Set(['server', 'auth']);

export function assertProjectRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, RUNTIME_KEYS, 'runtime');
  assertProjectServerConfigOwnership(childRecord(runtime, 'server'));
  assertProjectAuthConfigOwnership(childRecord(runtime, 'auth'));
}

export function assertLocalRuntimeConfigOwnership(value: unknown): void {
  const runtime = record(value, 'runtime');
  onlyKeys(runtime, RUNTIME_KEYS, 'runtime');
  assertLocalServerConfigOwnership(childRecord(runtime, 'server'));
  assertLocalAuthConfigOwnership(childRecord(runtime, 'auth'));
}
