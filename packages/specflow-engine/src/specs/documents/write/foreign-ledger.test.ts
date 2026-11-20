import { describe, expect, it } from 'vitest';

import type { LedgerEntry } from '../../durable';
import { foreignLedgerPaths } from './foreign-ledger';

const entry = (path: string, operationIds: string[], operationCount = operationIds.length) =>
  ({
    path,
    postSha256: null,
    operationIds,
    operationCount,
    recordedAt: '2026-11-20T00:00:00.000Z',
    reason: 'auto-commit-off',
  }) satisfies LedgerEntry;

const mine = (id: string) => id.startsWith('agent-');

describe('foreign ledger authors of an agent write', () => {
  it('admits paths without an entry and entries made only by the same author', () => {
    expect(
      foreignLedgerPaths(
        [entry('specs/active/a/notes.md', ['agent-1', 'agent-2'])],
        ['specs/active/a/notes.md', 'specs/active/a/new.md'],
        mine,
      ),
    ).toEqual([]);
  });

  it('refuses a path another author changed, matching paths case-insensitively', () => {
    expect(
      foreignLedgerPaths(
        [
          entry('specs/active/a/specification.yaml', ['agent-1', 'person-1']),
          entry('specs/active/a/other.md', ['person-2']),
        ],
        ['specs/active/a/notes.md', 'specs/active/A/Specification.yaml'],
        mine,
      ),
    ).toEqual(['specs/active/a/specification.yaml']);
  });

  it('fails closed when the entry dropped operation ids it still counts', () => {
    expect(foreignLedgerPaths([entry('a.md', ['agent-1'], 51)], ['a.md'], mine)).toEqual(['a.md']);
  });
});
