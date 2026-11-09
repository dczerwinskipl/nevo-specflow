import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  SPEC,
  claude,
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
} from './operations.test-support';
import { returnToStep, type ReturnToStepInput } from './return';
import { startTaskExecution } from './start';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('return to an earlier step', () => {
  it('changes no Task status; the new breakdown drafts and decides explicitly', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', executor: claude });

    const returned = await returnToStep(dependencies, {
      executor: owner,
      subject: specification,
      step: 'breakdown',
      feedback: 'Add an audit Task.',
    });

    expect(returned.continuation).toMatchObject({ kind: 'attention', reason: 'owner-action' });
    const after = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(after.map((entry) => [entry.record.taskId, entry.record.status])).toEqual([
      ['api', 'ready'],
      ['screen', 'ready'],
    ]);

    const started = await startSpecification(dependencies);
    expect(started).toMatchObject({
      context: {
        step: { id: 'breakdown' },
        handoff: { kind: 'return', feedback: 'Add an audit Task.' },
      },
    });
    const drafted = await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: {
        tasks: [{ id: 'audit', title: 'Audit', type: 'implementation', dependsOn: ['api'] }],
        taskDecisions: [{ taskId: 'screen', status: 'on-hold', reason: 'Wait for the audit.' }],
      },
      executor: claude,
    });
    expect(drafted.createdTasks).toEqual(['audit']);
    await work(dependencies, specification, { result: 'pass' });

    const resumed = (await inspectExecution(dependencies, SPEC)).tasks;
    expect(
      resumed.map((entry) => [entry.record.taskId, entry.record.status, entry.readiness.kind]),
    ).toEqual([
      ['api', 'ready', 'ready'],
      ['audit', 'ready', 'dependencies'],
      ['screen', 'on-hold', 'status'],
    ]);
    expect(resumed[2]?.record.statusChange).toMatchObject({
      source: 'decision',
      reason: 'Wait for the audit.',
    });
    await expect(
      returnToStep(dependencies, {
        executor: owner,
        subject: task('screen'),
        step: 'implement',
        feedback: 'x',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BLOCKED' });
  });

  it('rejects the whole finish when one Task decision is not allowed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await returnToStep(dependencies, {
      executor: owner,
      subject: specification,
      step: 'breakdown',
      feedback: 'x',
    });
    await startSpecification(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(
      finishStep(dependencies, {
        subject: specification,
        step: 'breakdown',
        attempt: 2,
        input: {
          tasks: [],
          taskDecisions: [
            { taskId: 'api', status: 'cancelled' },
            { taskId: 'screen', status: 'ready' },
          ],
        },
        executor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(dependencies.store.applied).toHaveLength(applied);
  });

  it('refuses an undeclared return and a return of a finished run', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification);

    await expect(
      returnToStep(dependencies, {
        executor: owner,
        subject: specification,
        step: 'acceptance',
        feedback: 'x',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_RETURN_NOT_ALLOWED' });
    await expect(
      returnToStep(dependencies, { executor: owner, subject: specification, step: 'requirements' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
  });

  it('refuses a declared return to a step the run has never reached', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies); // requirements is active

    await expect(
      returnToStep(dependencies, {
        executor: owner,
        subject: specification,
        step: 'breakdown',
        feedback: 'x',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_RETURN_NOT_ALLOWED' });
    expect(dependencies.store.applied).toHaveLength(1);
    expect((await inspectExecution(dependencies, SPEC)).specification?.record.run.position).toEqual(
      { state: 'active', step: 'requirements', attempt: 1 },
    );
  });

  it('is an owner action: refused without the owner as executor, before anything is written', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification);
    const applied = dependencies.store.applied.length;

    for (const executor of [undefined, claude]) {
      await expect(
        returnToStep(dependencies, {
          subject: specification,
          step: 'requirements',
          feedback: 'x',
          ...(executor ? { executor } : {}),
        } as ReturnToStepInput),
      ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
    }

    expect(dependencies.store.applied).toHaveLength(applied);
  });
});
