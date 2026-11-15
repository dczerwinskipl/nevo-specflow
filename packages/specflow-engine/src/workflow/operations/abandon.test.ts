import { beforeAll, describe, expect, it } from 'vitest';

import { closeBlockers, specificationLifecycleActions } from '../close/blockers';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions } from './actions';
import { abandonSpecification } from './abandon';
import { inspectExecution } from './inspect';
import {
  claude,
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  SPEC,
  specificationWithTasks,
  startSpecification,
  type Dependencies,
} from './operations.test-support';
import { readSpecificationExitState } from './specification-exit';
import { startTaskExecution } from './start';
import { createTask } from './task-resource';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

const REASON = 'Superseded by the billing rewrite.';
const abandon = (dependencies: Dependencies, reason = REASON) =>
  abandonSpecification(dependencies, { specId: SPEC, reason, actor: owner });
const draft = (dependencies: Dependencies, taskId: string) =>
  createTask(dependencies, {
    specId: SPEC,
    taskId,
    title: taskId,
    type: 'implementation',
    actor: owner,
  });

/** Expect a refusal that wrote nothing. */
async function refused(dependencies: Dependencies, operation: Promise<unknown>, code: string) {
  const applied = dependencies.store.applied.length;
  await expect(operation).rejects.toMatchObject({ code });
  expect(dependencies.store.applied).toHaveLength(applied);
}

describe('abandonSpecification', () => {
  it('ends every run and cancels every open Task in one change, then Close finds nothing', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
    await draft(dependencies, 'docs');
    const applied = dependencies.store.applied.length;

    const result = await abandon(dependencies);

    expect(dependencies.store.applied).toHaveLength(applied + 1);
    expect(result).toMatchObject({
      specId: SPEC,
      abandonment: {
        actor: owner,
        reason: REASON,
        from: { state: 'active', step: 'implementation' },
      },
      cancelledTasks: ['api', 'docs', 'screen'],
      abandonedTaskRuns: ['api'],
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification?.record.run.position).toEqual({
      state: 'terminal',
      outcome: 'abandoned',
    });
    for (const { record } of inspection.tasks) {
      expect(record).toMatchObject({
        status: 'cancelled',
        statusChange: { source: 'abandon', at: result.abandonment.at, reason: REASON },
      });
    }

    expect(closeBlockers(await readSpecificationExitState(dependencies, SPEC))).toEqual([]);
    // The Overview reads who abandoned it, when and why from the projection.
    expect(
      (await inspectActions(dependencies, { kind: 'specification', specId: SPEC })).position,
    ).toEqual({
      kind: 'terminal',
      outcome: 'abandoned',
      abandonment: { at: result.abandonment.at, reason: REASON, actor: owner },
    });
  });

  it('is final: the same reason returns the same result, another one is refused', async () => {
    const dependencies = memoryDependencies(catalogue);
    await draft(dependencies, 'docs');
    const first = await abandon(dependencies);

    // A Specification that never started gets its run pinned and ended in the same change.
    expect(first).toMatchObject({
      abandonment: { from: { state: 'not-started' } },
      cancelledTasks: ['docs'],
      abandonedTaskRuns: [],
    });
    const applied = dependencies.store.applied.length;
    await expect(abandon(dependencies, `  ${REASON} `)).resolves.toEqual(first);
    expect(dependencies.store.applied).toHaveLength(applied);
    await refused(dependencies, draft(dependencies, 'late'), 'WORKFLOW_SPECIFICATION_ENDED');
    await refused(
      dependencies,
      abandon(dependencies, 'Another reason.'),
      'WORKFLOW_SPECIFICATION_ENDED',
    );
    await expect(startSpecification(dependencies)).resolves.toMatchObject({ kind: 'terminal' });
    await refused(
      dependencies,
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'docs', actor: claude }),
      'WORKFLOW_TASK_BLOCKED',
    );
  });

  it('stays possible when the pinned workflow changed or is gone; Close keeps its rules', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    const changed = { ...dependencies, catalogue: { ...catalogue, workflow: () => undefined } };

    const exit = specificationLifecycleActions(await readSpecificationExitState(changed, SPEC));
    expect(exit.abandon).toEqual({ kind: 'allowed' });
    expect(exit.close.kind).toBe('blocked');
    await expect(abandon(changed)).resolves.toMatchObject({
      abandonment: { from: { state: 'active' } },
    });
  });

  it('is not a bypass: pending writes and other operations refuse it with the blockers', async () => {
    const dependencies = memoryDependencies(catalogue);
    await draft(dependencies, 'docs');
    dependencies.references.pendingDocuments.add('docs');
    dependencies.holds.pendingChange = true;

    await expect(abandon(dependencies)).rejects.toMatchObject({
      code: 'WORKFLOW_EXIT_BLOCKED',
      blockers: [
        { kind: 'pending-execution-change', subjectIds: [SPEC] },
        { kind: 'pending-task-documents', subjectIds: ['docs'] },
      ],
    });
    dependencies.references.pendingDocuments.clear();
    dependencies.holds.pendingChange = false;
    dependencies.holds.inProgress = true;
    await refused(dependencies, abandon(dependencies), 'WORKFLOW_EXIT_BLOCKED');
    dependencies.holds.inProgress = false;
    await refused(dependencies, abandon(dependencies, '  '), 'WORKFLOW_INPUT_INVALID');
    await expect(abandon(dependencies)).resolves.toMatchObject({ cancelledTasks: ['docs'] });
  });
});
