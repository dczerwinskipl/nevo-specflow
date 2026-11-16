import { describe, expect, it } from 'vitest';
import type { RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import type { WorkflowRefusal } from '../refusal';
import { closeDialogOutcome, type CloseDialogFacts } from './closeDialogOutcome';

const refusal = (code: string, extra: Partial<WorkflowRefusal> = {}): WorkflowRefusal => ({
  code,
  gates: [],
  blockers: [],
  repository: [],
  draftConflicts: [],
  openTasks: [],
  outcomeUnknown: false,
  ...extra,
});

const untracked: RepositoryBlocker = {
  kind: 'uncommitted-changes',
  checkout: 'specification',
  paths: ['specs/active/sso/overview.md'],
  count: 1,
};
const idle: CloseDialogFacts['close'] = { status: 'idle' };

describe('closeDialogOutcome', () => {
  it('is checking, never ready, while the preview runs the repository checks', () => {
    expect(closeDialogOutcome({ preview: { status: 'pending' }, close: idle })).toEqual({
      kind: 'checking',
    });
  });

  it('is ready only once the preview planned the Close', () => {
    expect(closeDialogOutcome({ preview: { status: 'success' }, close: idle })).toEqual({
      kind: 'ready',
    });
  });

  it('lists the repository preconditions a preview refused with as blockers', () => {
    expect(
      closeDialogOutcome({
        preview: {
          status: 'error',
          refusal: refusal('CLOSE_PREFLIGHT', {
            repository: [untracked, { kind: 'integration-target-missing' }],
          }),
        },
        close: idle,
      }),
    ).toEqual({
      kind: 'blocked',
      blockers: [],
      repository: [untracked, { kind: 'integration-target-missing' }],
    });
  });

  it('names a refused preview by its code, never as an unchanged workflow', () => {
    const cannotStart = (code: string) =>
      closeDialogOutcome({ preview: { status: 'error', refusal: refusal(code) }, close: idle });

    expect(cannotStart('CLOSE_PREFLIGHT')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.close.refusal.preflight',
    });
    expect(cannotStart('CLOSE_SHARED_WORKTREE')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.close.refusal.sharedWorktree',
    });
    expect(cannotStart('SOMETHING_NEW')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.close.refusal.unknown',
    });
    expect(cannotStart('CONTROL_LOCK_BUSY')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.refusal.busy',
    });
  });

  it('lets a Close refused with repository preconditions replace the ready state', () => {
    expect(
      closeDialogOutcome({
        preview: { status: 'success' },
        close: {
          status: 'error',
          refusal: refusal('CLOSE_PREFLIGHT', { repository: [untracked] }),
        },
      }),
    ).toEqual({ kind: 'blocked', blockers: [], repository: [untracked] });
  });

  it('shows a refused Close as not closed, without the ready state', () => {
    expect(
      closeDialogOutcome({
        preview: { status: 'success' },
        close: { status: 'error', refusal: refusal('DOCUMENT_COMMITS_PENDING') },
      }),
    ).toEqual({
      kind: 'not-closed',
      reasonKey: 'workflowExecution.close.refusal.documentsPending',
    });
  });

  it('shows the running Close instead of the ready state', () => {
    expect(
      closeDialogOutcome({ preview: { status: 'success' }, close: { status: 'pending' } }),
    ).toEqual({ kind: 'closing' });
  });

  it('says how document commits hold the Close, by their cause', () => {
    const held = (documentCause: string) =>
      closeDialogOutcome({
        preview: {
          status: 'error',
          refusal: refusal('DOCUMENT_COMMITS_PENDING', { documentCause }),
        },
        close: idle,
      });

    // Queued for the automatic commit: it settles by itself, so the dialog keeps checking.
    expect(held('commit-pending')).toEqual({ kind: 'checking', waitingFor: 'documents' });
    expect(held('commit-uncommitted')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.close.refusal.documentsUncommitted',
    });
    expect(held('commit-failed')).toEqual({
      kind: 'cannot-start',
      reasonKey: 'workflowExecution.close.refusal.documentsFailed',
    });
  });

  it('shows a Close refused by documents still being committed as not closed', () => {
    expect(
      closeDialogOutcome({
        preview: { status: 'success' },
        close: {
          status: 'error',
          refusal: refusal('DOCUMENT_COMMITS_PENDING', { documentCause: 'commit-pending' }),
        },
      }),
    ).toEqual({
      kind: 'not-closed',
      reasonKey: 'workflowExecution.close.refusal.documentsPending',
    });
  });

  it('shows a Close that did not complete as needing attention', () => {
    expect(
      closeDialogOutcome({
        preview: { status: 'success' },
        close: {
          status: 'success',
          result: { operationId: 'op-1', status: 'requires-resolution' },
        },
      }),
    ).toEqual({ kind: 'needs-attention', status: 'requires-resolution' });
  });

  it('lists the workflow blockers with the running Sessions before any preview', () => {
    const workflow = { kind: 'specification-run' as const, subjectIds: ['spec'], message: '' };
    const sessions = { kind: 'session-turn-running' as const, subjectIds: ['s-1'], message: '' };

    expect(
      closeDialogOutcome({
        workflowBlockers: [workflow],
        occupancyBlockers: [sessions],
        preview: { status: 'pending' },
        close: idle,
      }),
    ).toEqual({ kind: 'blocked', blockers: [workflow, sessions], repository: [] });
  });
});
