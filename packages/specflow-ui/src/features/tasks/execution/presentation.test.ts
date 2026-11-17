import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import {
  actorLabel,
  attemptLine,
  nowSecondary,
  personLabel,
  progressLine,
  stepTrack,
} from './presentation';

const t = ((key: string) => (key === 'workflowExecution.actor.you' ? 'you' : key)) as TFunction;

describe('recorded actor labels', () => {
  const ann = { userId: 'ann' };

  it('names the viewer and the trusted local person "you"', () => {
    expect(personLabel(t, 'user:ann', ann)).toBe('you');
    expect(personLabel(t, 'runtime:trusted-local')).toBe('you');
  });

  it('names the CLI actor of this machine "you", whichever channel recorded it', () => {
    const local = { userId: 'ann', localActorId: 'local:domin' };

    expect(personLabel(t, 'local:domin', local)).toBe('you');
    expect(personLabel(t, 'user:ann', local)).toBe('you');
    expect(personLabel(t, 'local:bob', local)).toBe('bob');
  });

  it('names anyone else by the recorded id without its identity-source prefix', () => {
    expect(personLabel(t, 'user:bob', ann)).toBe('bob');
    expect(personLabel(t, 'local:bob')).toBe('bob');
    expect(personLabel(t, 'local:ann', ann)).toBe('ann');
    expect(personLabel(t, 'user:ann')).toBe('ann');
  });

  it('names an agent by provider and model', () => {
    expect(
      actorLabel(t, { class: 'agent', details: { provider: 'claude', model: 'opus' } }, ann),
    ).toBe('claude · opus');
    expect(
      actorLabel(
        t,
        { class: 'human', details: { actorId: 'user:ann', trust: 'authenticated' } },
        ann,
      ),
    ).toBe('you');
  });
});

describe('progress line', () => {
  const echo = ((key: string, values?: Record<string, unknown>) =>
    [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;
  const step = (position: number, title: string) => ({ step: 's' + position, title, position });

  it('names the position and the next step', () => {
    expect(
      progressLine(echo, { stepCount: 7, current: step(2, 'Write'), next: step(3, 'Design') }),
    ).toBe('workflowExecution.now.progressNext {"position":2,"total":7,"next":"Design"}');
    expect(progressLine(echo, { stepCount: 7, current: step(7, 'Accept') })).toBe(
      'workflowExecution.now.progress {"position":7,"total":7}',
    );
  });

  it('says nothing before the first start and once the run ended', () => {
    expect(progressLine(echo, { stepCount: 7, next: step(1, 'Gather') })).toBeUndefined();
    expect(progressLine(echo, { stepCount: 7 })).toBeUndefined();
    expect(progressLine(echo, undefined)).toBeUndefined();
  });
});

describe('attempt line', () => {
  const echo = ((key: string, values?: Record<string, unknown>) =>
    [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;

  it('never names a first attempt', () => {
    expect(attemptLine(echo, { number: 1, since: '11:18', actor: 'you' })).toBe(
      'workflowExecution.now.active {"since":"11:18","actor":"you"}',
    );
  });

  it('names the attempt from the second one on', () => {
    expect(attemptLine(echo, { number: 2, since: '11:18', actor: 'you' })).toBe(
      'workflowExecution.now.activeAttempt {"attempt":2,"since":"11:18","actor":"you"}',
    );
  });
});

describe('step track', () => {
  const key = ((name: string) => name) as unknown as TFunction;
  const step = (position: number, title: string) => ({ step: 's' + position, title, position });
  type TrackInput = Pick<WorkflowActionProjection, 'outline' | 'position'>;

  it('places the current step', () => {
    expect(
      stepTrack(key, {
        outline: { stepCount: 7, current: step(4, 'Break'), next: step(5, 'Review') },
        position: { kind: 'ready', next: { step: { id: 's4', title: 'Break', kind: 'work' } } },
      } as TrackInput),
    ).toMatchObject({ position: { state: 'current', step: 4 }, total: 7 });
  });

  it('outlines the first step before the start, fills a completed run, skips an abandoned one', () => {
    expect(
      stepTrack(key, {
        outline: { stepCount: 7, next: step(1, 'Gather') },
        position: { kind: 'not-started', preview: { firstStepTitle: 'Gather' } },
      } as TrackInput)?.position,
    ).toEqual({ state: 'not-started' });
    expect(
      stepTrack(key, {
        outline: { stepCount: 7 },
        position: { kind: 'terminal', outcome: 'completed' },
      })?.position,
    ).toEqual({ state: 'completed' });
    expect(
      stepTrack(key, {
        outline: { stepCount: 7 },
        position: { kind: 'terminal', outcome: 'abandoned' },
      }),
    ).toBeUndefined();
    expect(
      stepTrack(key, { position: { kind: 'terminal', outcome: 'completed' } }),
    ).toBeUndefined();
  });
});

describe('the Now secondary action', () => {
  const gate = (id: string): GateStatus =>
    ({
      id,
      type: 'document',
      label: id,
      scope: { kind: 'specification', specId: 'sso' },
      status: 'unsatisfied',
      reason: 'sections-missing',
      documentId: id,
    }) as GateStatus;
  const active = (
    produces: 'tasks' | undefined,
    gates: GateStatus[] = [],
    createTask: 'allowed' | 'unavailable' = 'allowed',
  ) =>
    ({
      position: {
        kind: 'active',
        step: { id: 'any', title: 'Any', kind: 'work', ...(produces ? { produces } : {}) },
        attempt: { number: 1, startedAt: '', actor: { class: 'human', details: {} } },
      },
      actions: {
        finish: {
          step: 'any',
          attempt: 1,
          transitions: [{ id: 'done', target: { kind: 'step', step: 'x' }, gates }],
        },
      },
      specification: {
        createTask:
          createTask === 'allowed'
            ? { kind: 'allowed' }
            : { kind: 'unavailable', reason: 'task-limit' },
        taskTypes: [],
      },
    }) as unknown as WorkflowActionProjection;
  const any = () => true;

  it('keeps Finish step beside an unmet gate that is the main action', () => {
    expect(nowSecondary(active(undefined, [gate('a')]), 'gate', any)).toEqual({ kind: 'finish' });
  });

  it('offers New task at a step that produces Tasks while a Task may be created', () => {
    expect(nowSecondary(active('tasks'), 'finish', any)).toEqual({ kind: 'new-task' });
    expect(nowSecondary(active('tasks', [], 'unavailable'), 'finish', any)).toBeUndefined();
    expect(nowSecondary(active(undefined), 'finish', any)).toBeUndefined();
  });

  it('offers an unmet gate that has an action and is not the main action', () => {
    const projection = active(undefined, [gate('a')]);
    expect(nowSecondary(projection, 'finish', any)).toEqual({ kind: 'gate', gate: gate('a') });
    expect(nowSecondary(projection, 'finish', () => false)).toBeUndefined();
  });

  it('offers nothing beside a lifecycle or Close action', () => {
    expect(nowSecondary(active('tasks'), 'other', any)).toBeUndefined();
  });
});
