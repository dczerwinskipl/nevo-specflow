import { createHmac, timingSafeEqual } from 'node:crypto';
import { StoreFault, fail } from './encoding';

export function createSessionCursors(generation: string, projectId: string, cursorKey: Buffer) {
  function cursor(
    sid: string,
    actor: string,
    collection: string,
    upper: number,
    parent = '',
  ): string {
    const data = Buffer.from(
      JSON.stringify({
        generation,
        project: projectId,
        sid,
        actor,
        collection,
        upper,
        parent,
        expires: Date.now() + 86400000,
      }),
    ).toString('base64url');

    return data + '.' + createHmac('sha256', cursorKey).update(data).digest('base64url');
  }

  function boundary(
    token: string,
    sid: string,
    actor: string,
    collection: string,
    parent = '',
  ): number {
    try {
      const [data, signature, ...rest] = token.split('.');
      if (!data || !signature || rest.length) {
        throw new Error();
      }

      const expected = createHmac('sha256', cursorKey).update(data).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error();
      }

      const value = JSON.parse(Buffer.from(data, 'base64url').toString()) as {
        generation: string;
        project: string;
        sid: string;
        actor: string;
        collection: string;
        upper: number;
        parent: string;
        expires: number;
      };
      if (
        value.generation !== generation ||
        value.project !== projectId ||
        value.sid !== sid ||
        value.actor !== actor ||
        value.collection !== collection ||
        value.parent !== parent ||
        !Number.isSafeInteger(value.upper)
      ) {
        throw new Error();
      }

      if (value.expires < Date.now()) {
        fail('SESSION_CURSOR_EXPIRED', 'History cursor expired. Open the current Session again.');
      }

      return value.upper;
    } catch (error) {
      if (error instanceof StoreFault) {
        throw error;
      }

      return fail('SESSION_CURSOR_INVALID', 'Invalid history cursor.');
    }
  }

  return { cursor, boundary };
}
