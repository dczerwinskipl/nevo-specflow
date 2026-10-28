// The structural guards and the executor identity guard are shared with the other durable records
// (the lease, the ledger, the manual-commit journal); the journal codecs keep importing them here.
export { exactKeys, isCount, isIsoInstant, isRecord } from '../../../durable/guards';
export { isExecutorIdentity } from '../../../durable/executor-identity';

export const SHA256 = /^[0-9a-f]{64}$/u;
export const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
export const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isReason(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && KEBAB_CASE.test(value);
}
