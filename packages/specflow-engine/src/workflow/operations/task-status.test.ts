import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { FEEDBACK_MAX } from '../limits';
import type { OwnerActor } from '../state/model';
import { finishStep, type FinishStepInput } from './finish';
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

/** The seed catalogue with the Specification workflow edited; the edit must change it. */
async function seedCatalogueWith(edit: (workflow: string) => string): Promise<ExecutionCatalogue> {
  const files = await seedDefinitionFiles();
  const path = 'workflow/specification-standard.yaml';
  const edited = edit(files[path] ?? '');
  if (edited === files[path]) {
    throw new Error('The edit did not change the seed workflow.');
  }

  files[path] = edited;

  return resolveExecutionCatalogue(
    await loadDefinitions(new MemoryDefinitionSource(files), createDefaultDefinitionRegistry()),
  );
}

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
    actor: owner,
  });

const startTask = (dependencies: Dependencies, taskId: string) =>
  startTaskExecution(dependencies, { specId: SPEC, taskId, actor: claude });

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
        actor: claude as unknown as OwnerActor,
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
      actor: claude,
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

    // Resumed, the Task again needs what its finished step decided: a model for the review.
    await decide(dependencies, 'api', 'ready');
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: task('api'), step: 'review', reason: 'model-missing' },
    ]);
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

  it('refuses to enter the wait step while a Task is draft, and enters it once each is decided', async () => {
    const dependencies = memoryDependencies(
      await seedCatalogueWith((text) => text.replace('        effects: [approve-draft-tasks]', '')),
    );
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    const reviewer = agent('codex', 'session-r', 'x');
    const review = (taskDecisions: FinishStepInput['input']['taskDecisions']) =>
      finishStep(dependencies, {
        subject: specification,
        step: 'breakdown-review',
        attempt: 1,
        input: { result: 'pass', ...(taskDecisions ? { taskDecisions } : {}) },
        actor: reviewer,
      });
    await startSpecification(dependencies, reviewer);
    const before = await inspectExecution(dependencies, SPEC);

    await expect(review(undefined)).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message: 'Cannot enter the wait step "implementation": Tasks still draft: api, screen.',
    });
    await expect(review([{ taskId: 'api', status: 'ready' }])).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message: expect.stringContaining('Tasks still draft: screen.') as unknown,
    });
    // Nothing was written: the review attempt stays active and the Tasks stay draft.
    expect(await inspectExecution(dependencies, SPEC)).toEqual(before);

    const reviewed = await review([
      { taskId: 'api', status: 'ready' },
      { taskId: 'screen', status: 'cancelled' },
    ]);

    expect(reviewed.continuation).toEqual({ kind: 'none', reason: 'waiting-for-tasks' });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'active',
      step: 'implementation',
      attempt: 1,
    });
  });

  it('applies the review decisions before the approval of the remaining drafts', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
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
      actor: claude,
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
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });
});

describe('escalation to the Specification', () => {
  const escalate = (dependencies: Dependencies, feedback?: string, taskId = 'api') =>
    work(dependencies, task(taskId), {
      result: 'needs-spec-change',
      ...(feedback !== undefined ? { feedback } : {}),
    });

  /** The seed Specification workflow without its `task-escalated` transition. */
  const withoutEscalationTransition = () =>
    seedCatalogueWith((text) => text.replace(/ {6}- id: task-escalated\r?\n(?: {8}.*\r?\n)+/u, ''));

  /** Two independent Tasks, approved and waited for, each with its implement step done. */
  const waitForIndependentTasks = async (dependencies: Dependencies) => {
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: {
        tasks: [
          { id: 'api', title: 'API', type: 'implementation' },
          { id: 'web', title: 'Web', type: 'implementation' },
        ],
      },
      actor: claude,
    });
    await work(dependencies, specification, { result: 'pass' }, agent('codex', 'session-r', 'x'));
    await work(dependencies, task('api'));
    await work(dependencies, task('web'));
  };

  it('holds the Task and moves the waiting Specification to the breakdown with the feedback', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));

    const escalated = await escalate(dependencies, 'The API contract contradicts the overview.');

    expect(escalated.position).toEqual({ state: 'ready', step: 'implement' });
    expect(escalated.continuation).toEqual({ kind: 'none', reason: 'on-hold' });
    expect(escalated.specification).toMatchObject({
      kind: 'attention',
      step: 'breakdown',
      reason: 'owner-action',
    });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'breakdown',
    });
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
    await expect(startSpecification(dependencies)).resolves.toMatchObject({
      context: {
        step: { id: 'breakdown' },
        handoff: {
          kind: 'transition',
          from: { step: 'implementation', attempt: 1 },
          transition: 'task-escalated',
          feedback: escalatedFeedback('api'),
        },
      },
    });

    await decide(dependencies, 'api', 'ready', 'The overview is fixed.');
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

  /** The handoff feedback of the `task-escalated` transition for these escalated Tasks. */
  const escalatedFeedback = (ids: string) =>
    `Escalated Tasks: ${ids}. Each Task's escalation feedback is in its status change.`;

  it('names the escalated Tasks in the handoff and shows each reason in the breakdown context', async () => {
    const dependencies = memoryDependencies(catalogue);
    await waitForIndependentTasks(dependencies);
    const apiReason = 'a'.repeat(FEEDBACK_MAX);
    const webReason = 'w'.repeat(FEEDBACK_MAX);
    await escalate(dependencies, apiReason, 'api');
    // The Specification left the wait with the first escalation, so this one only holds the Task.
    expect((await escalate(dependencies, webReason, 'web')).specification).toBeUndefined();

    await expect(startSpecification(dependencies)).resolves.toMatchObject({
      context: {
        step: { id: 'breakdown' },
        handoff: { transition: 'task-escalated', feedback: escalatedFeedback('api') },
        existingTasks: [
          { id: 'api', statusChange: { source: 'escalation', reason: apiReason } },
          { id: 'web', statusChange: { source: 'escalation', reason: webReason } },
        ],
      },
    });
  });

  it('refuses to enter the wait step while a Task is draft or escalated, before anything is stored', async () => {
    const dependencies = memoryDependencies(
      await seedCatalogueWith((text) => text.replace('        effects: [approve-draft-tasks]', '')),
    );
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    await work(
      dependencies,
      specification,
      {
        result: 'pass',
        taskDecisions: [
          { taskId: 'api', status: 'ready' },
          { taskId: 'screen', status: 'ready' },
        ],
      },
      agent('codex', 'session-r', 'x'),
    );
    await work(dependencies, task('api'));
    await escalate(dependencies, 'Split the API Task.');
    await startSpecification(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: { tasks: [{ id: 'extra', title: 'Extra', type: 'implementation' }] },
      actor: claude,
    });
    await startSpecification(dependencies);
    const before = await inspectExecution(dependencies, SPEC);

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'breakdown-review',
        attempt: 2,
        input: { result: 'pass' },
        actor: claude,
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message:
        'Cannot enter the wait step "implementation": Tasks still draft: extra; Tasks escalated: api.',
    });
    expect(await inspectExecution(dependencies, SPEC)).toEqual(before);
  });

  it('keeps waiting with one task-escalated item listing every escalated Task without the transition', async () => {
    const dependencies = memoryDependencies(await withoutEscalationTransition());
    await waitForIndependentTasks(dependencies);

    // Each feedback fits the stored limit; together they do not, and need not.
    const first = await escalate(dependencies, 'w'.repeat(FEEDBACK_MAX), 'web');
    expect(first.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'task-escalated',
      taskIds: ['web'],
    });
    const second = await escalate(dependencies, 'a'.repeat(FEEDBACK_MAX), 'api');

    expect(second.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'task-escalated',
      taskIds: ['api', 'web'],
    });
    expect(await positionOf(dependencies, specification)).toMatchObject({
      state: 'active',
      step: 'implementation',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'task-escalated', taskIds: ['api', 'web'] },
    ]);

    const resumed = await decide(dependencies, 'api', 'ready');
    expect(resumed.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'task-escalated',
      taskIds: ['web'],
    });
    // Once no Task is escalated, the Specification just waits; each resumed Task waits for its start.
    await decide(dependencies, 'web', 'ready');
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: task('api'), step: 'implement', reason: 'owner-action' },
      { subject: task('web'), step: 'implement', reason: 'owner-action' },
    ]);
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
    await returnToStep(dependencies, {
      actor: owner,
      subject: specification,
      step: 'breakdown',
      feedback: 'x',
    });
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
    await returnToStep(dependencies, {
      actor: owner,
      subject: specification,
      step: 'breakdown',
      feedback: 'x',
    });
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

  it('records no item while a Specification step is worked on, and refuses the wait while escalated', async () => {
    const dependencies = memoryDependencies(await withoutEscalationTransition());
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, {
      actor: owner,
      subject: specification,
      step: 'breakdown',
      feedback: 'x',
    });
    await startSpecification(dependencies);

    const escalated = await escalate(dependencies, 'Split the API Task.');

    expect(escalated.specification).toBeUndefined();
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: { tasks: [] },
      actor: claude,
    });
    await expect(work(dependencies, specification, { result: 'pass' })).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message: 'Cannot enter the wait step "implementation": Tasks escalated: api.',
    });
  });
});
