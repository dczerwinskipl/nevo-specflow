import { describe, expect, it } from 'vitest';

import type { LedgerEntry } from '../../durable';
import { foreignLedgerPaths, sameAuthor } from './foreign-ledger';

const entry = (
  path: string,
  operations: [operationId: string, executionId?: string][],
  operationCount = operations.length,
): LedgerEntry => {
  const executions = operations.flatMap(([operationId, executionId]) =>
    executionId !== undefined ? [{ operationId, executionId }] : [],
  );

  return {
    path,
    postSha256: null,
    operationIds: operations.map(([operationId]) => operationId),
    operationCount,
    recordedAt: '2026-11-20T00:00:00.000Z',
    reason: 'auto-commit-off',
    ...(executions.length > 0 ? { executions } : {}),
  };
};

const mine = (executionId: string) => executionId.startsWith('turn-');

describe('foreign ledger authors of an agent write', () => {
  it('admits paths without an entry and entries made only by executions of the same author', () => {
    expect(
      foreignLedgerPaths(
        [
          entry('specs/active/a/notes.md', [
            ['op-1', 'turn-1'],
            ['op-2', 'turn-2'],
          ]),
        ],
        ['specs/active/a/notes.md', 'specs/active/a/new.md'],
        mine,
      ),
    ).toEqual([]);
  });

  it('refuses a path a person or another author changed, matching paths case-insensitively', () => {
    expect(
      foreignLedgerPaths(
        [
          entry('specs/active/a/specification.yaml', [['op-1', 'turn-1'], ['op-person']]),
          entry('specs/active/a/notes.md', [['op-2', 'other-turn']]),
          entry('specs/active/a/other.md', [['op-3']]),
        ],
        ['specs/active/a/notes.md', 'specs/active/A/Specification.yaml'],
        mine,
      ),
    ).toEqual(['specs/active/a/notes.md', 'specs/active/a/specification.yaml']);
  });

  it('fails closed when the entry dropped operation ids it still counts', () => {
    expect(foreignLedgerPaths([entry('a.md', [['op-1', 'turn-1']], 51)], ['a.md'], mine)).toEqual([
      'a.md',
    ]);
  });

  it('counts Turns of the same Session as one author', () => {
    const intent = (ownerId: string) => ({ operationId: 'x', ownerId, binding: 'a'.repeat(64) });
    expect(sameAuthor(intent('session-1'), intent('session-1'))).toBe(true);
    expect(sameAuthor(intent('session-1'), intent('session-2'))).toBe(false);
  });

  it('counts only Turns of the same agent attempt as one author once a Turn has one', () => {
    const turn = (attemptId?: string) => ({
      operationId: 'x',
      ownerId: 'session-1',
      binding: 'a'.repeat(64),
      ...(attemptId !== undefined ? { attempt: { attemptId } } : {}),
    });
    expect(sameAuthor(turn('attempt-1'), turn('attempt-1'))).toBe(true);
    expect(sameAuthor(turn('attempt-1'), turn('attempt-2'))).toBe(false);
    // The same Session's ad-hoc Turn is another author of the attempt's work.
    expect(sameAuthor(turn('attempt-1'), turn())).toBe(false);
    expect(sameAuthor(turn(), turn('attempt-1'))).toBe(false);
  });
});
