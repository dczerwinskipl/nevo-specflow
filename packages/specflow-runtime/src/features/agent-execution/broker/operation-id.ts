import { createHash } from 'node:crypto';

/**
 * The Engine operation id of a broker request: a name-based UUID (version 8) over the invocation id
 * and the client's request id (D11 point 4). A client retry of the same request in the same
 * invocation is an exact Engine replay; the same request id under another invocation is another
 * operation, so no client can replay or collide with an operation of another invocation.
 */
export function brokerOperationId(invocationId: string, requestId: string): string {
  const hash = createHash('sha256')
    .update('nevo-specflow/agent-broker/operation\0')
    .update(invocationId)
    .update('\0')
    .update(requestId)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x80;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
