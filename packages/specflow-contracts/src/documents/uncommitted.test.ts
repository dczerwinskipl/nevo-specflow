import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  CommitInfoSchema,
  DOCUMENT_OPERATION_STAGES,
  DocumentErrorDetailsSchema,
  DocumentOperationStatusSchema,
  DocumentTreeSchema,
  ManualCommitInputSchema,
  ManualCommitResultSchema,
  UNCOMMITTED_ENTRIES_MAX,
  UncommittedViewSchema,
} from './index';

const entry = {
  path: 'specs/active/x/a.md',
  reason: 'auto-commit-off',
  recordedAt: '2026-10-27T10:00:00.000Z',
  operations: 2,
};
const view = {
  ledgerRevision: 'a'.repeat(64),
  policy: { documents: 'manual', source: 'local' },
  entries: [entry],
  queue: { pending: 0, failed: 0, recoveryRequired: 0 },
};

describe('uncommitted changes contract', () => {
  it('accepts the ledger read and keeps it strict and bounded', () => {
    expect(Value.Check(UncommittedViewSchema, view)).toBe(true);
    expect(
      Value.Check(UncommittedViewSchema, {
        ...view,
        entries: [{ ...entry, documentId: 'overview', reason: 'abandoned' }],
      }),
    ).toBe(true);
    for (const bad of [
      { ...view, extra: 1 },
      { ...view, policy: { documents: 'sometimes', source: 'local' } },
      { ...view, policy: { documents: 'auto', source: 'env' } },
      { ...view, entries: [{ ...entry, reason: 'whim' }] },
      { ...view, entries: [{ ...entry, operations: 0 }] },
      { ...view, entries: Array.from({ length: UNCOMMITTED_ENTRIES_MAX + 1 }, () => entry) },
    ]) {
      expect(Value.Check(UncommittedViewSchema, bad)).toBe(false);
    }
  });

  it('has the state uncommitted and no stage or state abandoned', () => {
    expect(Value.Check(CommitInfoSchema, { state: 'uncommitted', reason: 'abandoned' })).toBe(true);
    expect(Value.Check(CommitInfoSchema, { state: 'abandoned' })).toBe(false);
    expect((DOCUMENT_OPERATION_STAGES as readonly string[]).includes('abandoned')).toBe(false);
  });

  it('reports the policy mode of the documents in the tree commits summary', () => {
    const commits = DocumentTreeSchema.properties.commits;
    for (const policy of ['auto', 'manual']) {
      expect(
        Value.Check(commits, {
          pending: 0,
          failed: 0,
          recoveryRequired: 0,
          uncommitted: 3,
          policy,
        }),
      ).toBe(true);
    }
    expect(
      Value.Check(commits, { pending: 0, failed: 0, recoveryRequired: 0, policy: 'off' }),
    ).toBe(false);
  });
});

const operationId = '3f2b8c1e-5a7d-4e90-8b6a-1c2d3e4f5a6b';

describe('manual commit contract', () => {
  it('accepts the documented request shapes and rejects the rest', () => {
    for (const good of [
      { operationId },
      { operationId, scope: 'all' },
      {
        operationId,
        scope: 'specification',
        message: 'Update the notes\n\nbody',
        paths: ['specs/active/x/a.md'],
        ledgerRevision: 'abc',
      },
    ]) {
      expect(Value.Check(ManualCommitInputSchema, good)).toBe(true);
    }
    for (const bad of [
      {},
      { operationId: 'nope' },
      { operationId, scope: 'definitions' },
      { operationId, paths: [] },
      { operationId, paths: [''] },
      { operationId, paths: Array.from({ length: 201 }, (_, index) => 'p' + String(index)) },
      { operationId, ledgerRevision: '' },
      { operationId, extra: true },
    ]) {
      expect(Value.Check(ManualCommitInputSchema, bad)).toBe(false);
    }
  });

  it('answers a commit or nothing to commit, with the files and what the ledger still holds', () => {
    const remaining = { entries: 0, ledgerRevision: 'a'.repeat(64) };
    expect(
      Value.Check(ManualCommitResultSchema, {
        operationId,
        commit: { state: 'committed', sha: 'f'.repeat(40) },
        paths: ['specs/active/x/a.md'],
        remaining,
      }),
    ).toBe(true);
    expect(
      Value.Check(ManualCommitResultSchema, {
        operationId,
        commit: { state: 'not-applicable', reason: 'nothing-to-commit' },
        paths: [],
        remaining,
      }),
    ).toBe(true);
    expect(Value.Check(ManualCommitResultSchema, { operationId, commit: {}, paths: [] })).toBe(
      false,
    );
  });

  it('carries the conflicting or required paths in the error details, at most 25', () => {
    expect(
      Value.Check(DocumentErrorDetailsSchema, { paths: ['a.md'], cause: 'branch-changed' }),
    ).toBe(true);
    expect(
      Value.Check(DocumentErrorDetailsSchema, {
        paths: Array.from({ length: 26 }, (_, index) => 'p' + String(index)),
      }),
    ).toBe(false);
    expect(Value.Check(DocumentErrorDetailsSchema, { paths: [''] })).toBe(false);
  });

  it('reports a manual commit as a document operation action', () => {
    expect(
      Value.Check(DocumentOperationStatusSchema, {
        operationId,
        specId: 'x',
        action: 'manual-commit',
        documentIds: [],
        createdAt: '2026-10-27T10:00:00.000Z',
        commit: { state: 'committed', sha: 'f'.repeat(40) },
      }),
    ).toBe(true);
  });
});
