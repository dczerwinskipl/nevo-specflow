import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SessionListFilter } from '@nevo/specflow-contracts/sessions';
import { StoreFault, fail } from './encoding';

const LIST_CURSOR_VERSION = 1;
const TTL_MS = 86400000;

/** Canonical filter identity: the same selection always hashes the same, any other never. */
function filterHash(filter: SessionListFilter): string {
  const canonical = Object.entries(filter).sort(([a], [b]) => a.localeCompare(b));

  return createHash('sha256').update(JSON.stringify(canonical)).digest('base64url');
}

export function createSessionCursors(generation: string, projectId: string, cursorKey: Buffer) {
  function sign(value: object): string {
    const data = Buffer.from(JSON.stringify(value)).toString('base64url');

    return data + '.' + createHmac('sha256', cursorKey).update(data).digest('base64url');
  }

  /** The signed payload, or `undefined` for a malformed or foreign token. */
  function verify(token: string): Record<string, unknown> | undefined {
    try {
      const [data, signature, ...rest] = token.split('.');
      if (!data || !signature || rest.length) {
        return undefined;
      }

      const expected = createHmac('sha256', cursorKey).update(data).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return undefined;
      }

      const value: unknown = JSON.parse(Buffer.from(data, 'base64url').toString());

      return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }

  function cursor(
    sid: string,
    actor: string,
    collection: string,
    upper: number,
    parent = '',
  ): string {
    return sign({
      generation,
      project: projectId,
      sid,
      actor,
      collection,
      upper,
      parent,
      expires: Date.now() + TTL_MS,
    });
  }

  function boundary(
    token: string,
    sid: string,
    actor: string,
    collection: string,
    parent = '',
  ): number {
    try {
      const value = verify(token);
      if (
        value?.generation !== generation ||
        value.project !== projectId ||
        value.sid !== sid ||
        value.actor !== actor ||
        value.collection !== collection ||
        value.parent !== parent ||
        !Number.isSafeInteger(value.upper)
      ) {
        throw new Error();
      }

      if ((value.expires as number) < Date.now()) {
        fail('SESSION_CURSOR_EXPIRED', 'History cursor expired. Open the current Session again.');
      }

      return value.upper as number;
    } catch (error) {
      if (error instanceof StoreFault) {
        throw error;
      }

      return fail('SESSION_CURSOR_INVALID', 'Invalid history cursor.');
    }
  }

  /** A Session list keyset cursor, bound to this store generation, project and exact filter. */
  function listCursor(filter: SessionListFilter, after: number): string {
    return sign({
      version: LIST_CURSOR_VERSION,
      generation,
      project: projectId,
      filter: filterHash(filter),
      after,
      expires: Date.now() + TTL_MS,
    });
  }

  /** The `created_seq` a list cursor continues after; a changed filter invalidates it. */
  function listBoundary(token: string, filter: SessionListFilter): number {
    const value = verify(token);
    if (
      value?.version !== LIST_CURSOR_VERSION ||
      value.generation !== generation ||
      value.project !== projectId ||
      value.filter !== filterHash(filter) ||
      !Number.isSafeInteger(value.after) ||
      (value.after as number) < 1 ||
      typeof value.expires !== 'number'
    ) {
      return fail('SESSION_CURSOR_INVALID', 'Invalid Session list cursor.');
    }

    if (value.expires < Date.now()) {
      fail('SESSION_CURSOR_EXPIRED', 'Session list cursor expired. Open the list again.');
    }

    return value.after as number;
  }

  return { cursor, boundary, listCursor, listBoundary };
}
