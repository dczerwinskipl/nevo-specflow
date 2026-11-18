import { describe, expect, it } from 'vitest';

import type { ExecutionTask } from '../state/model';
import { heldTaskAttention, startBlockerAttention, type HeldTaskInput } from './attention';
import type { StartBlocker } from './start-blockers';

const subject = { kind: 'task', specId: 'spec', taskId: 'api' } as const;
const next = { step: { id: 'implement', title: 'Implement' } };
const gate = {
  id: 'entry-1',
  type: 'document',
  label: 'A design document exists',
  labelDeclared: true,
  documentType: 'design',
  requiredSections: [],
  scope: { kind: 'task', specId: 'spec', taskId: 'api' },
  status: 'unsatisfied',
  reason: 'no-document',
} as const;
const unresolved: StartBlocker = {
  kind: 'context-unresolved',
  entries: [{ index: 1, kind: 'path', reason: 'not-found' }],
};
const gates: StartBlocker = { kind: 'gates-unsatisfied', gates: [gate] };
const waiting: StartBlocker = { kind: 'dependencies', waitingFor: ['base'], unsatisfiable: [] };

const of = (...blockers: StartBlocker[]) => startBlockerAttention(subject, blockers, next, []);

describe('startBlockerAttention (owner decision 2A)', () => {
  it('gives no attention for being ready, a draft, a hold, a normal wait or an awaited artifact', () => {
    expect(of()).toBeUndefined();
    expect(of({ kind: 'status', status: 'draft' })).toBeUndefined();
    expect(of({ kind: 'status', status: 'on-hold' })).toBeUndefined();
    expect(of(waiting)).toBeUndefined();
    expect(of({ kind: 'context-awaited', entries: [{ index: 0, kind: 'path' }] })).toBeUndefined();
    // A draft with an unresolved context is still a draft: approving it comes first.
    expect(of({ kind: 'status', status: 'draft' }, unresolved)).toBeUndefined();
  });

  it('asks for an unmet entry gate only once no dependency can still deliver it', () => {
    // A dependency that can still complete may write the document: not attention yet.
    expect(of(waiting, gates)).toBeUndefined();
    expect(of(gates)).toMatchObject({
      reason: 'entry-gate-unsatisfied',
      actor: 'owner',
      action: 'satisfy-gate',
      step: 'implement',
      stepTitle: 'Implement',
      message: '"Implement" cannot start until A design document exists.',
    });
  });

  it('asks the owner to fix an actionable blocker, the most fundamental one first', () => {
    expect(
      of(unresolved, { kind: 'dependencies', waitingFor: ['b', 'a'], unsatisfiable: ['b', 'a'] }),
    ).toMatchObject({
      reason: 'dependency-unsatisfiable',
      action: 'edit-dependencies',
      secondaryAction: 'cancel-task',
      taskIds: ['a', 'b'],
    });
    expect(
      of(unresolved, { kind: 'type-not-allowed', message: 'Spike is not allowed.' }),
    ).toMatchObject({
      reason: 'type-not-allowed',
      action: 'open-project-settings',
      secondaryAction: 'cancel-task',
      message: 'Spike is not allowed.',
    });
  });

  it('points a dependency on a broken Task to restoring it', () => {
    expect(
      startBlockerAttention(
        subject,
        [{ kind: 'dependencies', waitingFor: ['gone'], unsatisfiable: ['gone'] }],
        next,
        ['gone'],
      ),
    ).toMatchObject({
      reason: 'dependency-unsatisfiable',
      action: 'restore-task',
      secondaryAction: 'edit-dependencies',
      taskIds: ['gone'],
      message:
        'It depends on broken tasks: gone. Restore their files from Git, or edit its dependencies.',
    });
  });
});

const held = (taskId: string, fields: Partial<ExecutionTask> = {}): ExecutionTask => ({
  specId: 'spec',
  taskId,
  title: taskId,
  type: 'implementation',
  dependsOn: [],
  origin: { kind: 'manual', actorId: 'local:owner' },
  status: 'on-hold',
  statusChange: { source: 'decision', at: '2026-11-17T10:00:00.000Z', reason: 'Waiting for IT.' },
  documents: [],
  ...fields,
});
const ready = (taskId: string, dependsOn: string[] = []): ExecutionTask => {
  const { statusChange: _statusChange, ...task } = held(taskId, { dependsOn });

  return { ...task, status: 'ready' };
};

const holdOf = (input: Partial<HeldTaskInput> & Pick<HeldTaskInput, 'tasks'>) =>
  heldTaskAttention({ specId: 'spec', named: new Set(), ...input });
const finishing = (open: readonly ExecutionTask[]): NonNullable<HeldTaskInput['finish']> => ({
  step: 'breakdown',
  stepTitle: 'Breakdown',
  open: open.map((task) => ({ taskId: task.taskId, cause: 'on-hold' as const })),
});

describe('heldTaskAttention (owner decision 2026-11-16: the user must act)', () => {
  it('gives no attention for a hold that nothing waits on and that blocks no finish', () => {
    expect(holdOf({ tasks: [held('api'), ready('web')] })).toEqual([]);
    // A draft, a held or a cancelled dependent does not wait on it yet.
    expect(
      holdOf({
        tasks: [
          held('api'),
          { ...ready('draft', ['api']), status: 'draft' },
          held('paused', { dependsOn: ['api'] }),
          held('gone', { status: 'cancelled', dependsOn: ['api'] }),
        ],
      }),
    ).toEqual([]);
  });

  it('names the open Tasks that wait on the hold directly, in id order', () => {
    const tasks = [
      held('api'),
      ready('web', ['api']),
      ready('cli', ['api', 'web']),
      ready('docs', ['web']),
    ];

    expect(holdOf({ tasks })).toEqual([
      {
        subject: { kind: 'task', specId: 'spec', taskId: 'api' },
        reason: 'on-hold-blocking',
        actor: 'owner',
        action: 'resume-task',
        secondaryAction: 'cancel-task',
        blocks: { taskIds: ['cli', 'web'] },
        message: 'It is on hold and holds up cli, web: resume it, or cancel it.',
      },
    ]);
  });

  it('names the active step whose finish to completed the hold refuses', () => {
    const api = held('api');

    expect(holdOf({ tasks: [api, held('web')], finish: finishing([api]) })).toEqual([
      expect.objectContaining({
        subject: { kind: 'task', specId: 'spec', taskId: 'api' },
        reason: 'on-hold-blocking',
        step: 'breakdown',
        stepTitle: 'Breakdown',
        blocks: { finish: 'breakdown' },
        message: 'It is on hold and keeps "Breakdown" from finishing: resume it, or cancel it.',
      }),
    ]);
    // Both at once: still one item for the Task.
    expect(holdOf({ tasks: [api, ready('web', ['api'])], finish: finishing([api]) })).toMatchObject(
      [{ blocks: { taskIds: ['web'], finish: 'breakdown' } }],
    );
  });

  it('keeps escalation its own reason, on the Task only when no Specification item names it', () => {
    const escalated = held('api', {
      statusChange: { source: 'escalation', at: '2026-11-17T10:00:00.000Z', reason: 'Split it.' },
    });
    const tasks = [escalated, ready('web', ['api'])];

    expect(holdOf({ tasks })).toEqual([
      expect.objectContaining({
        subject: { kind: 'task', specId: 'spec', taskId: 'api' },
        reason: 'task-escalated',
        action: 'resume-task',
        secondaryAction: 'cancel-task',
      }),
    ]);
    expect(holdOf({ tasks, named: new Set(['api']) })).toEqual([]);
  });

  it('leaves an escalation to the Specification work step that decides it', () => {
    const escalated = held('api', {
      statusChange: { source: 'escalation', at: '2026-11-17T10:00:00.000Z', reason: 'Split it.' },
    });

    // Not even `on-hold-blocking` for its dependents: the step decides the escalated Task.
    expect(
      holdOf({ tasks: [escalated, ready('web', ['api'])], decidingStep: 'breakdown' }),
    ).toEqual([]);
    // A person's hold is still reported while that step runs.
    expect(
      holdOf({ tasks: [held('api'), ready('web', ['api'])], decidingStep: 'breakdown' }),
    ).toMatchObject([{ reason: 'on-hold-blocking', blocks: { taskIds: ['web'] } }]);
  });

  it('adds no Task item for a hold the Specification item names (tasks-stuck)', () => {
    const api = held('api');

    expect(
      holdOf({
        tasks: [api, ready('web', ['api'])],
        named: new Set(['api']),
        finish: finishing([api]),
      }),
    ).toEqual([]);
  });

  it('lists at most five dependents in the message, every one in blocks', () => {
    const dependents = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ready(id, ['api']));
    const [only] = holdOf({ tasks: [held('api'), ...dependents] });

    expect(only?.blocks).toEqual({ taskIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(only?.message).toBe(
      'It is on hold and holds up a, b, c, d, e (+2): resume it, or cancel it.',
    );
  });
});
