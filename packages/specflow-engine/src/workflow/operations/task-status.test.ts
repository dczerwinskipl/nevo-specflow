import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../specs/definitions/kinds';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  SPEC,
  TWO_TASKS,
  agent,
  claude,
  memoryDependencies,
  owner,
  positionOf,
  runToBreakdown,
  seedDefinitionFiles,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
  type Dependencies,
} from './operations.test-support';
import { returnToStep } from './return';
import { startTaskExecution } from './start';
import { setTaskStatus, type SetTaskStatusInput } from './task-status';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

const decide = (
  dependencies: Dependencies,
  taskId: string,
  status: SetTaskStatusInput['status'],
  reason?: string,
) =>
  setTaskStatus(dependencies, {
    specId: SPEC,
    taskId,
    status,
    ...(reason !== undefined ? { reason } : {}),
    executor: owner,
  });

const startTask = (dependencies: Dependencies, taskId: string) =>
  startTaskExecution(dependencies, { specId: SPEC, taskId, executor: claude });

const statusOf = async (dependencies: Dependencies, taskId: string) =>
  (await inspectExecution(dependencies, SPEC)).tasks.find((entry) => entry.record.taskId === taskId)
    ?.record;

describe('setTaskStatus', () => {
  it('is an owner decision only', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    await expect(
      setTaskStatus(dependencies, {
        specId: SPEC,
        taskId: 'api',
        status: 'on-hold',
        executor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
  });

  it('holds a running Task: its step finishes, the next start is refused until it is resumed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    const started = await startTask(dependencies, 'api');
    if (started.kind === 'terminal') {
      throw new Error('Unexpected end.');
    }

    await decide(dependencies, 'api', 'on-hold', 'The API contract is being revised.');
    const finished = await finishStep(dependencies, {
      subject: task('api'),
      step: 'implement',
      attempt: started.context.attempt,
      input: {},
      executor: claude,
    });

    expect(finished.continuation).toEqual({ kind: 'none', reason: 'on-hold' });
    expect(finished.position).toEqual({ state: 'ready', step: 'review' });
    await expect(startTask(dependencies, 'api')).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_BLOCKED',
      message: expect.stringContaining('on-hold') as unknown,
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'tasks-stuck' },
    ]);

    await decide(dependencies, 'api', 'ready');
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await expect(startTask(dependencies, 'api')).resolves.toMatchObject({
      kind: 'started',
      context: { step: { id: 'review' } },
    });
  });

  it('completes the wait step when the last open Task is cancelled', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await work(dependencies, task('api'), { result: 'pass' });

    const cancelled = await decide(dependencies, 'screen', 'cancelled', 'Not needed.');

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      specification: { kind: 'attention', step: 'acceptance', reason: 'human-step' },
    });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'acceptance',
    });
    expect(await statusOf(dependencies, 'screen')).toMatchObject({
      status: 'cancelled',
      statusChange: { source: 'decision', reason: 'Not needed.' },
    });
  });

  it('tells the owner the Tasks are stuck when a dependency is cancelled', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    const cancelled = await decide(dependencies, 'api', 'cancelled', 'Done elsewhere.');

    expect(cancelled.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'tasks-stuck' },
    ]);
  });

  it('clears tasks-stuck when the owner approves a draft the wait was stuck on', async () => {
    const files = await seedDefinitionFiles();
    files['workflow/specification-standard.yaml'] = files[
      'workflow/specification-standard.yaml'
    ]!.replace('        effects: [approve-draft-tasks]', '');
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(files),
      createDefaultDefinitionRegistry(),
    );
    const dependencies = memoryDependencies(resolveExecutionCatalogue(loaded));
    const reviewed = await specificationWithTasks(dependencies);
    expect(reviewed.continuation).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
    });

    const approved = await decide(dependencies, 'api', 'ready');

    expect(approved.specification).toBeUndefined();
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await expect(startTask(dependencies, 'api')).resolves.toMatchObject({ kind: 'started' });
  });

  it('applies the review decisions before the approval of the remaining drafts', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      executor: claude,
    });

    const reviewed = await work(
      dependencies,
      specification,
      { result: 'pass', taskDecisions: [{ taskId: 'screen', status: 'cancelled' }] },
      agent('codex', 'session-r', 'x'),
    );

    expect(reviewed.continuation).toEqual({ kind: 'none', reason: 'waiting-for-tasks' });
    expect((await statusOf(dependencies, 'api'))?.status).toBe('ready');
    expect(await statusOf(dependencies, 'screen')).toMatchObject({
      status: 'cancelled',
      statusChange: { source: 'decision' },
    });
  });

  it('refuses a reason that is not a text before anything is stored', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    await expect(
      decide(dependencies, 'api', 'on-hold', 42 as unknown as string),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect((await statusOf(dependencies, 'api'))?.status).toBe('ready');
  });

  it('refuses Task decisions that are not a list', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      executor: claude,
    });

    await expect(
      work(dependencies, specification, {
        result: 'pass',
        taskDecisions: { taskId: 'screen', status: 'cancelled' } as unknown as [],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });

  it.each<[string, (dependencies: Dependencies) => Promise<unknown>]>([
    [
      'reopening a cancelled Task',
      (d) => decide(d, 'screen', 'cancelled').then(() => decide(d, 'screen', 'ready')),
    ],
    [
      'changing a Task whose run ended',
      async (d) => {
        await work(d, task('api'));
        await work(d, task('api'), { result: 'pass' });

        return decide(d, 'api', 'on-hold');
      },
    ],
    [
      'cancelling a running Task',
      (d) => startTask(d, 'api').then(() => decide(d, 'api', 'cancelled')),
    ],
    ['an unknown Task', (d) => decide(d, 'ghost', 'ready')],
  ])('refuses %s', async (_name, run) => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    await expect(run(dependencies)).rejects.toMatchObject({
      code: expect.stringMatching(/^WORKFLOW_(INPUT_INVALID|SUBJECT_NOT_FOUND)$/u) as unknown,
    });
  });

  it('refuses Task decisions in the finish of a Task step', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await startTask(dependencies, 'api');

    await expect(
      finishStep(dependencies, {
        subject: task('api'),
        step: 'implement',
        attempt: 1,
        input: { taskDecisions: [{ taskId: 'screen', status: 'on-hold' }] },
        executor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });
});

describe('escalation to the Specification', () => {
  const escalate = (dependencies: Dependencies, feedback?: string) =>
    work(dependencies, task('api'), {
      result: 'needs-spec-change',
      ...(feedback !== undefined ? { feedback } : {}),
    });

  it('holds the Task, gives the Specification task-escalated and resumes with the feedback', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));

    const escalated = await escalate(dependencies, 'The API contract contradicts the overview.');

    expect(escalated.position).toEqual({ state: 'ready', step: 'implement' });
    expect(escalated.continuation).toEqual({ kind: 'none', reason: 'on-hold' });
    // Both Tasks are stuck behind the held one, but the escalation names the cause.
    expect(escalated.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'task-escalated',
      taskId: 'api',
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.attention).toMatchObject([
      { subject: specification, reason: 'task-escalated', taskId: 'api' },
    ]);
    expect(await statusOf(dependencies, 'api')).toMatchObject({
      status: 'on-hold',
      statusChange: {
        source: 'escalation',
        reason: 'The API contract contradicts the overview.',
      },
    });
    await expect(startTask(dependencies, 'api')).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_BLOCKED',
    });

    await decide(dependencies, 'api', 'ready', 'The overview is fixed.');
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await expect(startTask(dependencies, 'api')).resolves.toMatchObject({
      context: {
        step: { id: 'implement' },
        handoff: {
          kind: 'transition',
          result: 'needs-spec-change',
          feedback: 'The API contract contradicts the overview.',
        },
      },
    });
  });

  it('requires feedback', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));

    await expect(escalate(dependencies)).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });

  it('keeps the owner item of a Specification that is not waiting when a Task escalates', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' });
    const specificationItem = async () =>
      (await inspectExecution(dependencies, SPEC)).attention.find(
        (item) => item.subject.kind === 'specification',
      );
    const before = await specificationItem();
    expect(before).toMatchObject({ step: 'breakdown' });
    expect(before?.reason).not.toBe('task-escalated');

    const escalated = await escalate(dependencies, 'Split the API Task.');

    expect(escalated.specification).toBeUndefined();
    expect(await specificationItem()).toEqual(before);

    const resumed = await decide(dependencies, 'api', 'ready', 'Not needed after all.');

    expect(resumed.specification).toBeUndefined();
    expect(await specificationItem()).toEqual(before);
  });

  it('shows the escalated Task to the spec writer step that starts after a return', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' });
    await escalate(dependencies, 'Split the API Task.');

    const started = await startSpecification(dependencies);
    expect(started).toMatchObject({
      context: {
        step: { id: 'breakdown' },
        existingTasks: [
          {
            id: 'api',
            status: 'on-hold',
            statusChange: { source: 'escalation', reason: 'Split the API Task.' },
          },
          { id: 'screen', status: 'ready' },
        ],
      },
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
  });

  it('records no item while a Specification step is worked on, and records it on the wait', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' });
    await startSpecification(dependencies);

    const escalated = await escalate(dependencies, 'Split the API Task.');

    expect(escalated.specification).toBeUndefined();
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: { tasks: [] },
      executor: claude,
    });
    const reviewed = await work(dependencies, specification, { result: 'pass' });
    expect(reviewed.continuation).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'task-escalated',
      taskId: 'api',
    });
  });
});
