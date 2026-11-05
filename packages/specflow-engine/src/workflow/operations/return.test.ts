import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  SPEC,
  claude,
  memoryDependencies,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
} from './operations.test-support';
import { returnToStep } from './return';
import { startTaskExecution } from './start';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('return to an earlier step', () => {
  it('blocks Tasks that have not started and resumes them after the new breakdown', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', executor: claude });

    const returned = await returnToStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      feedback: 'Add an audit Task.',
    });

    expect(returned.continuation).toMatchObject({ kind: 'attention', reason: 'owner-action' });
    const blocked = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(blocked.map((entry) => [entry.record.taskId, entry.readiness.kind])).toEqual([
      ['api', 'ready'],
      ['screen', 'blocked'],
    ]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', executor: claude }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BLOCKED' });
    await expect(
      returnToStep(dependencies, { subject: task('screen'), step: 'implement', feedback: 'x' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BLOCKED' });

    const started = await startSpecification(dependencies);
    expect(started).toMatchObject({
      context: {
        step: { id: 'breakdown' },
        handoff: { kind: 'return', feedback: 'Add an audit Task.' },
      },
    });
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: {},
      executor: claude,
    });
    await work(dependencies, specification, { result: 'pass' });
    const created = await work(dependencies, specification, {
      tasks: [{ id: 'audit', title: 'Audit', type: 'implementation', dependsOn: ['api'] }],
    });

    expect(created.createdTasks).toEqual(['audit']);
    const resumed = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(resumed.map((entry) => [entry.record.taskId, entry.readiness.kind])).toEqual([
      ['api', 'ready'],
      ['audit', 'dependencies'],
      ['screen', 'dependencies'],
    ]);
  });

  it('refuses an undeclared return and a return of a finished run', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification);

    await expect(
      returnToStep(dependencies, { subject: specification, step: 'acceptance', feedback: 'x' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_RETURN_NOT_ALLOWED' });
    await expect(
      returnToStep(dependencies, { subject: specification, step: 'requirements' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });

  it('refuses a declared return to a step the run has never reached', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies); // requirements is active

    await expect(
      returnToStep(dependencies, { subject: specification, step: 'breakdown', feedback: 'x' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_RETURN_NOT_ALLOWED' });
    expect(dependencies.store.applied).toHaveLength(1);
    expect((await inspectExecution(dependencies, SPEC)).specification?.record.run.position).toEqual(
      { state: 'active', step: 'requirements', attempt: 1 },
    );
  });
});
