import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  OPERATION_INTERRUPTED_CODE,
  OPERATION_LIST_ALL_STATUSES,
  OPERATION_LIST_KINDS,
  OPERATION_LIST_RESERVED_STATUSES,
  OperationListQuerySchema,
  OperationListResponseSchema,
  SPECIFICATION_CREATE_STEPS,
  type OperationListResponse,
} from './index';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const now = '2026-01-01T00:00:00.000Z';

const list = (items: unknown[]): unknown => ({
  items,
  counts: { inProgress: 1, recoveryRequired: 0, failed: 0, completed: 0 },
  truncated: false,
  generatedAt: now,
});

describe('operation list contract', () => {
  it('accepts a full running row with the Create step vocabulary', () => {
    const response: OperationListResponse = {
      items: [
        {
          operationId,
          kind: 'specification-create',
          status: 'in-progress',
          title: 'Billing',
          subject: { specId: 'billing', slug: 'billing' },
          target: { workspaceKind: 'new-worktree', workspaceId: 'ws-1', branch: 'spec/billing' },
          currentStep: 'writing-specification',
          steps: SPECIFICATION_CREATE_STEPS.map((id, index) => ({
            id,
            status: index < 2 ? 'done' : 'pending',
          })),
          startedAt: now,
          updatedAt: now,
        },
      ],
      counts: { inProgress: 1, recoveryRequired: 0, failed: 0, completed: 0 },
      truncated: false,
      generatedAt: now,
    };
    expect(Value.Check(OperationListResponseSchema, response)).toBe(true);
  });

  it('accepts a minimal row, including the interrupted code and an unknown step id', () => {
    expect(
      Value.Check(
        OperationListResponseSchema,
        list([
          {
            operationId,
            kind: 'specification-create',
            status: 'recovery-required',
            code: OPERATION_INTERRUPTED_CODE,
            currentStep: 'committing-specification',
            updatedAt: now,
          },
        ]),
      ),
    ).toBe(true);
  });

  it('lists document changes: queued is produced, the row carries action and documentCount', () => {
    expect([...OPERATION_LIST_KINDS]).toEqual([
      'specification-create',
      'document-change',
      'manual-commit',
    ]);
    expect([...OPERATION_LIST_RESERVED_STATUSES]).toEqual(['scheduled']);
    const row = {
      operationId,
      kind: 'document-change',
      status: 'queued',
      subject: { specId: 'billing', slug: 'billing' },
      action: 'save-all',
      documentCount: 3,
      updatedAt: now,
    };
    expect(Value.Check(OperationListResponseSchema, list([row]))).toBe(true);
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, documentCount: -1 }]))).toBe(
      false,
    );
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, path: 'a.md' }]))).toBe(false);
  });

  it('knows the reserved statuses but rejects an invented one', () => {
    expect(OPERATION_LIST_ALL_STATUSES).toEqual([
      'in-progress',
      'recovery-required',
      'failed',
      'completed',
      'queued',
      'scheduled',
    ]);
    const row = { operationId, kind: 'specification-create', updatedAt: now };
    expect(
      Value.Check(
        OperationListResponseSchema,
        list([{ ...row, status: 'scheduled', scheduledFor: now }]),
      ),
    ).toBe(true);
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, status: 'paused' }]))).toBe(
      false,
    );
  });

  it('is strict: no leaked fields, no malformed id, updatedAt required', () => {
    const row = { operationId, kind: 'specification-create', status: 'completed', updatedAt: now };
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, path: 'C:/x' }]))).toBe(false);
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, reason: 'x' }]))).toBe(false);
    expect(Value.Check(OperationListResponseSchema, list([{ ...row, operationId: 'nope' }]))).toBe(
      false,
    );
    const { updatedAt: _omit, ...withoutUpdated } = row;
    expect(Value.Check(OperationListResponseSchema, list([withoutUpdated]))).toBe(false);
    expect(
      Value.Check(OperationListResponseSchema, { ...(list([row]) as object), extra: true }),
    ).toBe(false);
  });

  it('bounds the query limit to 1..50', () => {
    expect(Value.Check(OperationListQuerySchema, { limit: 50, status: 'in-progress,failed' })).toBe(
      true,
    );
    expect(Value.Check(OperationListQuerySchema, { limit: 0 })).toBe(false);
    expect(Value.Check(OperationListQuerySchema, { limit: 51 })).toBe(false);
    expect(Value.Check(OperationListQuerySchema, { kind: 'x' })).toBe(false);
  });
});
