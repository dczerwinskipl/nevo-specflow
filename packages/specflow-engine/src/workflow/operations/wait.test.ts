import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  SPEC,
  claude,
  memoryDependencies,
  owner,
  positionOf,
  runToCreateTasks,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
} from './operations.test-support';
import { returnToStep } from './return';
import { startSpecificationExecution, startTaskExecution } from './start';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('Tasks of a Specification', () => {
  it('creates Tasks with their own types and workflows and waits for them', async () => {
    const dependencies = memoryDependencies(catalogue);
    const result = await specificationWithTasks(dependencies);

    expect(result.createdTasks).toEqual(['api', 'screen']);
    expect(result.continuation).toEqual({ kind: 'none', reason: 'waiting-for-tasks' });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'active',
      step: 'implementation',
      attempt: 1,
    });
    const tasks = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(tasks.map((entry) => [entry.record.taskId, entry.record.run.workflow.id])).toEqual([
      ['api', 'task-standard'],
      ['screen', 'task-ui'],
    ]);
    expect(tasks.map((entry) => entry.readiness.kind)).toEqual(['ready', 'dependencies']);
  });

  it('gives the planner the allowed task types', async () => {
    const dependencies = memoryDependencies(catalogue);
    const context = await runToCreateTasks(dependencies);

    expect(context.step).toMatchObject({ id: 'create-tasks', produces: 'tasks' });
    expect(context.taskTypes?.map((type) => type.id)).toEqual([
      'implementation',
      'ui-implementation',
    ]);
  });

  it('refuses to start a Task before its dependencies completed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);

    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', executor: claude }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEPENDENCY_UNSATISFIED' });
  });

  it('completes the wait step when the last Task ends and hands over to the owner', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    const reviewed = await work(dependencies, task('api'), { result: 'pass' });
    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();

    await work(dependencies, task('screen'));
    const last = await work(dependencies, task('screen'), { result: 'pass' });

    expect(last.specification).toEqual({
      kind: 'attention',
      step: 'acceptance',
      reason: 'human-step',
    });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'acceptance',
    });
  });

  it('never lets an agent do the human acceptance', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    for (const id of ['api', 'screen']) {
      await work(dependencies, task(id));
      await work(dependencies, task(id), { result: 'pass' });
    }

    await expect(work(dependencies, specification)).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    });
    const accepted = await work(dependencies, specification, {}, owner);
    expect(accepted.position).toEqual({ state: 'terminal', outcome: 'completed' });
  });

  it('rejects a task type the Specification archetype does not allow', async () => {
    const dependencies = memoryDependencies(catalogue);
    const start = () =>
      startSpecificationExecution(dependencies, {
        specId: SPEC,
        archetype: 'architecture',
        executor: claude,
      });
    for (let index = 0; index < 5; index += 1) {
      const started = await start();
      if (started.kind === 'terminal') {
        throw new Error('Unexpected end.');
      }

      await finishStep(dependencies, {
        subject: specification,
        step: started.context.step.id,
        attempt: started.context.attempt,
        input: started.context.step.id === 'breakdown-review' ? { result: 'pass' } : {},
        executor: claude,
      });
    }

    await start();
    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'create-tasks',
        attempt: 1,
        input: { tasks: [{ id: 'screen', title: 'Screen', type: 'ui-implementation' }] },
        executor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });
});

describe('ready Tasks', () => {
  it('never starts a Task or records attention for it just because it is ready', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await work(dependencies, task('api'), { result: 'pass' });

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.attention.map((item) => item.subject.kind)).not.toContain('task');
    expect(
      inspection.tasks.map((entry) => [entry.record.run.position.state, entry.readiness.kind]),
    ).toEqual([
      ['terminal', 'ready'],
      ['not-started', 'ready'],
    ]);
  });
});

describe('waiting for Tasks', () => {
  it('completes the wait step at once when the breakdown creates no Task', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToCreateTasks(dependencies);
    const result = await finishStep(dependencies, {
      subject: specification,
      step: 'create-tasks',
      attempt: 1,
      input: { tasks: [] },
      executor: claude,
    });

    expect(result.continuation).toEqual({
      kind: 'attention',
      step: 'acceptance',
      reason: 'human-step',
    });
    expect(await positionOf(dependencies, specification)).toEqual({
      state: 'ready',
      step: 'acceptance',
    });
  });

  it('tells the owner when the open Tasks can no longer progress, and clears it on a return', async () => {
    // A Task workflow whose review can also abandon the Task.
    const withAbandon: ExecutionCatalogue = {
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);
        if (id !== 'task-standard' || !definition) {
          return definition;
        }

        return {
          ...definition,
          steps: definition.steps.map((step) =>
            step.id === 'review'
              ? {
                  ...step,
                  transitions: [
                    ...step.transitions,
                    {
                      id: 'dropped',
                      result: 'drop',
                      target: { kind: 'terminal', outcome: 'abandoned' },
                      continuation: 'owner-action',
                      session: 'fresh',
                      feedback: 'optional',
                      effects: [],
                    },
                  ],
                }
              : step,
          ),
        };
      },
    };
    const dependencies = memoryDependencies(withAbandon);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    const dropped = await work(dependencies, task('api'), { result: 'drop' });

    expect(dropped.position).toEqual({ state: 'terminal', outcome: 'abandoned' });
    expect(dropped.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.tasks.map((entry) => entry.readiness)).toEqual([
      { kind: 'ready' },
      { kind: 'dependencies', waitingFor: ['api'] },
    ]);
    expect(inspection.attention).toMatchObject([{ subject: specification, reason: 'tasks-stuck' }]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', executor: claude }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_DEPENDENCY_UNSATISFIED',
      message: expect.stringContaining('can no longer complete') as unknown,
    });
    await expect(startSpecification(dependencies)).rejects.toMatchObject({
      code: 'WORKFLOW_POSITION_INVALID',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'tasks-stuck' },
    ]);

    await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Replace the API Task.',
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: specification, reason: 'owner-action' },
    ]);
  });

  it('lets a Task finish succeed after the Specification workflow was edited', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    const edited = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition && id === 'specification-standard'
          ? { ...definition, title: 'Edited' }
          : definition;
      },
    });
    Object.assign(edited, { store: dependencies.store });

    await work(edited, task('api'));
    const reviewed = await work(edited, task('api'), { result: 'pass' });

    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();
    await expect(startSpecification(edited)).rejects.toMatchObject({
      code: 'WORKFLOW_DEFINITION_CHANGED',
    });
  });

  it('leaves a Specification that works on a new breakdown alone when a running Task ends', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    await returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' });
    await startSpecification(dependencies);
    const edited = memoryDependencies({
      ...catalogue,
      workflow: (id) => {
        const definition = catalogue.workflow(id);

        return definition && id === 'specification-standard'
          ? { ...definition, title: 'Edited' }
          : definition;
      },
    });
    Object.assign(edited, { store: dependencies.store });

    const reviewed = await work(edited, task('api'), { result: 'pass' });

    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();
    const attention = (await inspectExecution(dependencies, SPEC)).attention;
    expect(attention.filter((item) => item.subject.kind === 'specification')).toEqual([]);
  });

  it('shows the planner the Tasks that already exist', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Add an audit Task.',
    });
    await work(dependencies, specification); // breakdown
    await work(dependencies, specification, { result: 'pass' });
    const started = await startSpecification(dependencies);

    expect(started).toMatchObject({
      context: {
        step: { id: 'create-tasks' },
        existingTasks: [
          {
            id: 'api',
            title: 'API',
            type: 'implementation',
            state: 'not-started',
            blocked: true,
            readiness: 'blocked',
          },
          {
            id: 'screen',
            title: 'Screen',
            type: 'ui-implementation',
            state: 'not-started',
            blocked: true,
            readiness: 'blocked',
          },
        ],
      },
    });
  });
});
