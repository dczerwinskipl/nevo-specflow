import type { AttentionItem, SpecificationListing } from '@nevo/specflow-engine';
import { CurrentSpecWorkflowSchema } from '@nevo/specflow-contracts/specs/overview';
import { WorkspaceAttentionSchema } from '@nevo/specflow-contracts/specs/workspace';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { overviewWorkflowOf, workspaceAttentionOf } from './engine-contribution';

describe('workspaceAttentionOf', () => {
  it('passes on what a held Task holds up, as the Engine reports it', () => {
    const item: AttentionItem = {
      subject: { kind: 'task', specId: 'spec', taskId: 'api' },
      step: 'acceptance',
      stepTitle: 'Acceptance',
      reason: 'on-hold-blocking',
      actor: 'owner',
      action: 'resume-task',
      secondaryAction: 'cancel-task',
      blocks: { taskIds: ['screen'], finish: 'acceptance' },
      message:
        'It is on hold and holds up screen and keeps "Acceptance" from finishing: resume it, or cancel it.',
    };

    const record = workspaceAttentionOf(item, new Map([['api', 'API']]));

    expect(record).toMatchObject({
      id: 'task-attention.api',
      kind: 'task',
      title: 'API',
      targetId: 'api',
      code: 'on-hold-blocking',
      action: 'resume-task',
      secondaryAction: 'cancel-task',
      blocks: { taskIds: ['screen'], finish: 'acceptance' },
    });
    expect(Value.Check(WorkspaceAttentionSchema, record)).toBe(true);
  });
});

describe('overviewWorkflowOf', () => {
  const listing = (standing: SpecificationListing['standing']): SpecificationListing => ({
    standing,
    tasks: { open: 12, total: 12, inProgress: 0, readyToStart: 5 },
    attention: 0,
    progress: { completed: 0, total: 12, cancelled: 0, ended: 0, onHold: 0 },
    preparation: 'prepared',
  });
  const step = { title: 'Waiting for Tasks', position: 6, count: 7 };

  it('carries the Task counts of a wait step only', () => {
    const waiting = overviewWorkflowOf(listing({ kind: 'step', state: 'waiting', step }));
    expect(waiting).toEqual({
      kind: 'step',
      state: 'waiting',
      step,
      tasks: { open: 12, total: 12, inProgress: 0, readyToStart: 5 },
    });
    expect(Value.Check(CurrentSpecWorkflowSchema, waiting)).toBe(true);

    const active = overviewWorkflowOf(
      listing({
        kind: 'step',
        state: 'active',
        step: { ...step, title: 'Breakdown' },
        actor: 'agent',
      }),
    );
    expect(active).toEqual({
      kind: 'step',
      state: 'active',
      step: { ...step, title: 'Breakdown' },
      actor: 'agent',
    });
  });

  it('passes a run that has not started or has ended on as it is', () => {
    expect(overviewWorkflowOf(listing({ kind: 'not-started' }))).toEqual({ kind: 'not-started' });
    expect(overviewWorkflowOf(listing({ kind: 'ended', outcome: 'completed' }))).toEqual({
      kind: 'ended',
      outcome: 'completed',
    });
  });
});
