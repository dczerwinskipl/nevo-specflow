import type { AttentionItem, SpecificationListing } from '@nevo/specflow-engine';
import { CurrentSpecWorkflowSchema } from '@nevo/specflow-contracts/specs/overview';
import { WorkspaceAttentionSchema } from '@nevo/specflow-contracts/specs/workspace';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  overviewExecutionOf,
  overviewWorkflowOf,
  workspaceAttentionOf,
} from './engine-contribution';

const agent = {
  class: 'agent',
  details: { provider: 'claude', model: 'claude-opus-5-5', sessionId: 'session-a' },
} as const;

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
    attention: [],
    taskTitles: new Map(),
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
        attempt: { number: 2, startedAt: '2026-11-25T10:00:00.000Z', actor: agent },
      }),
    );
    expect(active).toEqual({
      kind: 'step',
      state: 'active',
      step: { ...step, title: 'Breakdown' },
      attempt: { number: 2, startedAt: '2026-11-25T10:00:00.000Z', actor: agent },
    });
    expect(Value.Check(CurrentSpecWorkflowSchema, active)).toBe(true);
  });

  it('names the hand-off between attempts without its feedback', () => {
    const ready = overviewWorkflowOf(
      listing({
        kind: 'step',
        state: 'ready',
        step,
        handoff: {
          kind: 'transition',
          from: { step: 'review', attempt: 1, title: 'Review the breakdown' },
          transition: 'changes',
          result: 'fail',
          feedback: 'Split the API Task.',
          artifacts: [],
        },
      }),
    );
    expect(ready).toMatchObject({
      handoff: { result: 'fail', from: { title: 'Review the breakdown' } },
    });
    expect(ready).not.toHaveProperty('handoff.feedback');
    expect(Value.Check(CurrentSpecWorkflowSchema, ready)).toBe(true);
  });

  it('passes a run that has not started or has ended on as it is', () => {
    expect(overviewWorkflowOf(listing({ kind: 'not-started' }))).toEqual({ kind: 'not-started' });
    expect(overviewWorkflowOf(listing({ kind: 'ended', outcome: 'completed' }))).toEqual({
      kind: 'ended',
      outcome: 'completed',
    });
    expect(
      overviewWorkflowOf(
        listing({ kind: 'ended', outcome: 'abandoned', abandonedAt: '2026-11-20T09:00:00.000Z' }),
      ),
    ).toEqual({ kind: 'ended', outcome: 'abandoned', abandonedAt: '2026-11-20T09:00:00.000Z' });
  });
});

describe('overviewExecutionOf', () => {
  it('passes the first attention item on as the Overview record, with the Tasks it names', () => {
    const facts = overviewExecutionOf({
      standing: { kind: 'step', state: 'waiting' },
      tasks: { open: 2, total: 2, inProgress: 0, readyToStart: 0 },
      attention: [
        {
          subject: { kind: 'task', specId: 'spec', taskId: 'screen' },
          reason: 'dependency-unsatisfiable',
          actor: 'owner',
          action: 'restore-task',
          message: 'Its dependency api is broken.',
          taskIds: ['api'],
          brokenTaskIds: ['api'],
        },
        {
          subject: { kind: 'specification', specId: 'spec' },
          reason: 'tasks-stuck',
          actor: 'owner',
          action: 'review-tasks',
          message: 'No open Task can progress.',
        },
      ],
      taskTitles: new Map([
        ['api', 'API'],
        ['screen', 'Screen'],
        ['other', 'Other'],
      ]),
      progress: { completed: 0, total: 2, cancelled: 0, ended: 0, onHold: 0 },
      preparation: 'prepared',
    });

    expect(facts.attention).toBe(2);
    expect(facts.firstAttention).toMatchObject({
      first: {
        kind: 'task',
        title: 'Screen',
        code: 'dependency-unsatisfiable',
        action: 'restore-task',
        brokenTaskIds: ['api'],
      },
      taskTitles: { screen: 'Screen', api: 'API' },
    });
    expect(Object.keys(facts.firstAttention?.taskTitles ?? {}).sort()).toEqual(['api', 'screen']);
    expect(Value.Check(WorkspaceAttentionSchema, facts.firstAttention?.first)).toBe(true);
  });
});
