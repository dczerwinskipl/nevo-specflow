import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import {
  actorLabel,
  attemptLine,
  documentGateFix,
  doneWhen,
  nowActionPlan,
  personLabel,
  progressLine,
  stepGoal,
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
    expect(nowActionPlan(active(undefined, [gate('a')]), 'gate', any)).toEqual({
      secondary: { kind: 'finish' },
    });
  });

  it('keeps New task, quiet, beside a gate action and Finish step at a step that produces Tasks', () => {
    expect(nowActionPlan(active('tasks', [gate('a')]), 'gate', any)).toEqual({
      secondary: { kind: 'finish' },
      newTask: 'quiet',
    });
  });

  it('offers New task at a step that produces Tasks while a Task may be created', () => {
    expect(nowActionPlan(active('tasks'), 'finish', any)).toEqual({
      secondary: { kind: 'new-task' },
    });
    expect(nowActionPlan(active('tasks', [], 'unavailable'), 'finish', any)).toEqual({});
    expect(nowActionPlan(active(undefined), 'finish', any)).toEqual({});
  });

  it('makes New task the only action when Now has no main action', () => {
    expect(nowActionPlan(active('tasks'), 'none', any)).toEqual({ newTask: 'primary' });
    expect(nowActionPlan(active('tasks', [], 'unavailable'), 'none', any)).toEqual({});
    expect(nowActionPlan(active(undefined), 'none', any)).toEqual({});
  });

  it('offers an unmet gate that has an action and is not the main action', () => {
    const projection = active(undefined, [gate('a')]);
    expect(nowActionPlan(projection, 'finish', any)).toEqual({
      secondary: { kind: 'gate', gate: gate('a') },
    });
    expect(nowActionPlan(projection, 'finish', () => false)).toEqual({});
  });

  it('offers nothing beside a start, a lifecycle or a Close action', () => {
    expect(nowActionPlan(active('tasks'), 'other', any)).toEqual({});
    expect(nowActionPlan(active('tasks'), 'start', any)).toEqual({});
  });
});

describe('Task Now: Goal and Done when', () => {
  type Position = WorkflowActionProjection['position'];
  type Transition = NonNullable<
    WorkflowActionProjection['actions']['finish']
  >['transitions'][number];
  const actor = {
    class: 'human' as const,
    details: { actorId: 'local:ann', trust: 'local' as const },
  };
  type Exit = Extract<Position, { kind: 'active' }>['exits'][number];
  const at = (
    step: { purpose: string; instructions?: string },
    exits: readonly Exit[] = [],
  ): Position => ({
    kind: 'active',
    step: { id: 'implement', title: 'Implement', kind: 'work', ...step },
    attempt: { number: 1, startedAt: '2026-11-13T10:24:00Z', actor },
    exits: [...exits],
  });
  const gate = (id: string, met = false): GateStatus => ({
    id,
    type: 'document',
    label: `${id}.md is written`,
    labelDeclared: true,
    requiredSections: [],
    documentType: id,
    scope: { kind: 'task', specId: 's', taskId: 't' },
    status: met ? 'satisfied' : 'unsatisfied',
    ...(met ? { documentId: id } : { reason: 'no-document' as const }),
  });
  const toStep = (id: string, step: string, gates?: GateStatus[]): Transition => ({
    id,
    label: id,
    target: { kind: 'step', step },
    targetTitle: step === 'review' ? 'Review' : 'Implement',
    feedback: 'optional',
    ...(gates ? { gates } : {}),
  });
  const exitOf = ({ unavailable: _unavailable, ...exit }: Transition): Exit => exit;
  const projectionWith = (...transitions: Transition[]) => ({
    position: at({ purpose: '' }, transitions.map(exitOf)),
    actions: { finish: { step: 'implement', attempt: 1, transitions } },
  });
  /** An agent's attempt: the step's results are read, but there is no finish for the viewer. */
  const agentWith = (...transitions: Transition[]) => ({
    position: at({ purpose: '' }, transitions.map(exitOf)),
    actions: {},
  });

  it('is the purpose, else the first paragraph of the instructions, else nothing', () => {
    expect(stepGoal(at({ purpose: 'Write the code.' }))).toEqual({ text: 'Write the code.' });
    expect(stepGoal(at({ purpose: '', instructions: 'Only one paragraph.' }))).toEqual({
      text: 'Only one paragraph.',
    });
    expect(stepGoal(at({ purpose: '', instructions: 'First.\n\nSecond.' }))).toEqual({
      text: 'First.',
      more: 'First.\n\nSecond.',
    });
    expect(stepGoal(at({ purpose: '' }))).toBeUndefined();
  });

  it('lists every exit gate, met or not, once, and where the work goes', () => {
    const gates = [gate('task'), gate('notes', true)];

    expect(doneWhen(projectionWith(toStep('ready', 'review', gates)), { withThen: true })).toEqual({
      groups: [{ gates }],
      then: 'Review',
    });
    // The Specification's track names the next step already.
    expect(doneWhen(projectionWith(toStep('ready', 'review', gates)))).toEqual({
      groups: [{ gates }],
    });
  });

  it('names the result when results need different gates, and no step when they lead apart', () => {
    const done = doneWhen(
      projectionWith(toStep('ready', 'review', [gate('task')]), toStep('again', 'implement')),
      { withThen: true },
    );

    expect(done).toEqual({ groups: [{ result: 'ready', gates: [gate('task')] }] });
  });

  it('is only the next step when the step declares no gates, and nothing without either', () => {
    expect(doneWhen(projectionWith(toStep('ready', 'review')), { withThen: true })).toEqual({
      groups: [],
      then: 'Review',
    });
    expect(doneWhen(projectionWith(toStep('ready', 'review')))).toBeUndefined();
  });

  it('reads the results of the step whoever runs the attempt (an agent: no finish action)', () => {
    const gates = [gate('task')];

    expect(doneWhen(agentWith(toStep('ready', 'review', gates)), { withThen: true })).toEqual({
      groups: [{ gates }],
      then: 'Review',
    });
  });

  it('lists a gate only for the result its `when` names, and no step for results that part', () => {
    // The Engine applied `when: [approved]`: the gate is on Approved only; Changes needs none.
    const approved: Transition = {
      id: 'approved',
      result: 'approved',
      label: 'Approved',
      target: { kind: 'terminal', outcome: 'completed' },
      feedback: 'optional',
      gates: [gate('review-notes')],
    };

    expect(
      doneWhen(agentWith(approved, toStep('changes', 'implement')), { withThen: true }),
    ).toEqual({ groups: [{ result: 'Approved', gates: [gate('review-notes')] }] });
  });

  it('leaves out a result that waits for open Tasks', () => {
    const waiting: Transition = {
      ...toStep('accepted', 'review', [gate('task')]),
      unavailable: 'tasks-open',
    };

    expect(doneWhen(projectionWith(waiting))).toBeUndefined();
  });

  it('opens the document of an unmet gate and says which sections finish it', () => {
    const echo = ((key: string, values?: Record<string, unknown>) =>
      [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;

    expect(
      documentGateFix(
        echo,
        { ...gate('task'), reason: 'sections-missing', missingSections: ['Verification'] },
        'task.md',
      ),
    ).toEqual({
      label: 'workflowExecution.now.openDocument {"name":"task.md"}',
      hint: 'workflowExecution.now.addSectionsToFinish {"count":1,"sections":"Verification","name":"task.md"}',
    });
    expect(documentGateFix(echo, gate('task', true), 'task.md')).toEqual({
      label: 'workflowExecution.now.openDocument {"name":"task.md"}',
    });
  });
});
