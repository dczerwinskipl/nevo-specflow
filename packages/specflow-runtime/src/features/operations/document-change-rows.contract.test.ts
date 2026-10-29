import { OPERATION_LIST_KINDS, OperationSummarySchema } from '@nevo/specflow-contracts/operations';
import {
  DOCUMENT_ROW_PENDING_AFTER_MS,
  MANUAL_COMMIT_RECOVERY_CODE,
  type DocumentChangeListingRow,
  type ManualCommitListingRow,
} from '@nevo/specflow-engine';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import type { OperationSourceRow } from './operation-source';

/**
 * The Engine's rows of the document operation list are the contract rows of the list (ADR 0014)
 * plus the source `state` the list service judges by. This pins the correspondence the list route
 * relies on: a row is an `OperationSourceRow` as it is, and it becomes an `OperationSummary` by
 * dropping the three source-only fields.
 */

const BASE = {
  operationId: '3f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c35',
  kind: 'document-change',
  subject: { specId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', slug: 'sample' },
  action: 'save-all',
  documentCount: 3,
  startedAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:05.000Z',
  staleExempt: true,
} as const;

const ROWS: readonly DocumentChangeListingRow[] = [
  { ...BASE, status: 'queued', state: 'queued' },
  { ...BASE, status: 'failed', state: 'failed', code: 'COMMIT_BLOCKED' },
  {
    ...BASE,
    status: 'recovery-required',
    state: 'recovery-required',
    code: 'OPERATION_INTERRUPTED',
  },
  {
    operationId: BASE.operationId,
    kind: 'document-change',
    status: 'recovery-required',
    state: 'recovery-required',
    code: 'DOCUMENT_RECOVERY_REQUIRED',
    unreadable: true,
    updatedAt: BASE.updatedAt,
    staleExempt: true,
  },
];

function toSummary(row: DocumentChangeListingRow) {
  const { state: _state, staleExempt: _stale, unreadable: _unreadable, ...summary } = row;

  return summary;
}

describe('the document-change rows of the Engine', () => {
  it.each(ROWS.map((row) => [row.state + (row.unreadable ? ' (unreadable)' : ''), row] as const))(
    'a %s row is a source row and becomes a valid operation summary',
    (_name, row) => {
      const source: OperationSourceRow = row;
      expect(source.state).toBe(row.state);
      expect(Value.Check(OperationSummarySchema, toSummary(row))).toBe(true);
    },
  );

  it('never carries a path and is exempt from the idle-interrupted rule on every row', () => {
    for (const row of ROWS) {
      expect(row.staleExempt).toBe(true);
      expect(JSON.stringify(row)).not.toMatch(/\.md|specs\/|\\\\/u);
    }
  });

  it('lists a commit that waits after 30 seconds', () => {
    expect(DOCUMENT_ROW_PENDING_AFTER_MS).toBe(30_000);
  });
});

describe('the manual-commit rows of the Engine', () => {
  const MANUAL_ROWS: readonly ManualCommitListingRow[] = [
    {
      operationId: BASE.operationId,
      kind: 'manual-commit',
      subject: { specId: BASE.subject.specId },
      action: 'manual-commit',
      documentCount: 2,
      code: MANUAL_COMMIT_RECOVERY_CODE,
      startedAt: BASE.startedAt,
      updatedAt: BASE.updatedAt,
      status: 'recovery-required',
      state: 'recovery-required',
      staleExempt: true,
    },
    {
      operationId: BASE.operationId,
      kind: 'manual-commit',
      action: 'manual-commit',
      code: MANUAL_COMMIT_RECOVERY_CODE,
      updatedAt: BASE.updatedAt,
      status: 'recovery-required',
      state: 'recovery-required',
      staleExempt: true,
      unreadable: true,
    },
  ];

  it.each(MANUAL_ROWS.map((row) => [row.unreadable ? 'unreadable' : 'readable', row] as const))(
    'a %s row is a source row and becomes a valid operation summary of the kind manual-commit',
    (_name, row) => {
      const source: OperationSourceRow = { ...row, subject: row.subject };
      expect(source.state).toBe('recovery-required');
      const { state: _state, staleExempt: _stale, unreadable: _unreadable, ...summary } = row;
      expect(Value.Check(OperationSummarySchema, summary)).toBe(true);
      expect(OPERATION_LIST_KINDS).toContain(row.kind);
    },
  );

  it('never carries a path', () => {
    for (const row of MANUAL_ROWS) {
      expect(JSON.stringify(row)).not.toMatch(/\.md|specs\/|\\\\/u);
    }
  });
});
