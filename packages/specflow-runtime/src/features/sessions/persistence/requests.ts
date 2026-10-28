import { createHash } from 'node:crypto';
import { stable, fail } from './encoding';
import type { StoreDatabase } from './database';

export function createRequestJournal({ get, run }: Pick<StoreDatabase, 'get' | 'run'>) {
  function request(
    actor: string,
    command: string,
    scope: string,
    id: string,
    input: unknown,
  ): unknown {
    const row = get(
      'SELECT * FROM requests WHERE actor=? AND command=? AND scope=? AND id=?',
      actor,
      command,
      scope,
      id,
    );
    if (!row) return undefined;
    const hash = createHash('sha256').update(stable(input)).digest('hex');
    if (row.hash !== hash)
      fail('IDEMPOTENCY_CONFLICT', 'Request ID has already been used with different input.');
    return JSON.parse(String(row.result)) as unknown;
  }
  function remember(
    actor: string,
    command: string,
    scope: string,
    id: string,
    input: unknown,
    result: unknown,
  ): void {
    run(
      'INSERT INTO requests VALUES(?,?,?,?,?,?)',
      actor,
      command,
      scope,
      id,
      createHash('sha256').update(stable(input)).digest('hex'),
      JSON.stringify(result),
    );
  }

  return { request, remember };
}
