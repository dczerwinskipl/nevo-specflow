import { describe, expect, it } from 'vitest';

import type { LedgerEntry, LedgerRecord } from '../../../../specs/durable/ledger/model';
import { applyLedgerUpsert } from '../../../../specs/durable/ledger/upsert';
import { selectAttemptLedgerEntries } from './selection';

const OURS = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const LATER = '4c3f9d85-9d76-4f88-8a6b-4eadb05cbf04';
const OTHER = '5d4e0a96-ae87-4b99-9c7c-5fbec16dc006';
const invocations = new Set([OURS, LATER]);
const subject = {
  projectId: 'p',
  workspaceId: '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01',
  workspaceRoot: '/r',
  owner: { kind: 'specification', id: '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02' },
} as const;

let operation = 0;
/** The ledger after `writes` (path and the Turn that made the operation, none for the owner). */
function ledger(writes: readonly (readonly [string, string | undefined])[]): LedgerEntry[] {
  let record: LedgerRecord | undefined;
  for (const [path, executionId] of writes) {
    operation += 1;
    record = applyLedgerUpsert(record, subject, {
      operationId: `00000000-0000-4000-8000-${String(operation).padStart(12, '0')}`,
      reason: 'auto-commit-off',
      recordedAt: '2026-11-21T10:00:00.000Z',
      paths: [{ path, postSha256: null }],
      ...(executionId !== undefined ? { executionId } : {}),
      branch: 'main',
      head: null,
    });
  }

  return [...(record?.entries ?? [])];
}

describe('the ledger entries of an attempt commit', () => {
  it("selects the attempt's own entries, a truncated one too, and leaves another author's out", () => {
    const entries = ledger([
      ...Array.from({ length: 60 }, () => ['a.md', OURS] as const),
      ['b.md', LATER],
      ...Array.from({ length: 60 }, () => ['c.md', undefined] as const),
      ['d.md', OTHER],
    ]);
    expect(entries.find((entry) => entry.path === 'a.md')).toMatchObject({
      operationCount: 60,
      authors: { executions: [OURS] },
    });

    expect(selectAttemptLedgerEntries(entries, invocations)).toEqual({
      paths: ['a.md', 'b.md'],
      mixed: [],
    });
  });

  it('names an entry the attempt changed together with the owner or another Turn as mixed', () => {
    const entries = ledger([
      ['a.md', undefined],
      ['a.md', OURS],
      ...Array.from({ length: 55 }, () => ['b.md', OURS] as const),
      ['c.md', OTHER],
      ['c.md', LATER],
    ]);
    const b = entries.find((entry) => entry.path === 'b.md')!;

    expect(selectAttemptLedgerEntries(entries, invocations)).toEqual({
      paths: ['b.md'],
      mixed: ['a.md', 'c.md'],
    });
    // A record written before authors existed: a truncated entry is not provably the attempt's.
    const { authors: _authors, ...legacy } = b;
    expect(selectAttemptLedgerEntries([legacy], invocations)).toEqual({
      paths: [],
      mixed: ['b.md'],
    });
  });
});
