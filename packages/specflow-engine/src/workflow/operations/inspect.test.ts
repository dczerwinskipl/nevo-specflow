import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowStore } from '../state/store';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import { startTaskExecution } from './start';
import {
  SPEC,
  agent,
  claude,
  memoryDependencies,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
} from './operations.test-support';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('attention derived from the state', () => {
  it('shows the attention of the position a changed checkout holds', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, agent('antigravity', 'session-g'));
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { step: 'specification', reason: 'model-missing' },
    ]);

    // A branch switch: the checkout now holds a run that went on to the breakdown review.
    const other = memoryDependencies(catalogue);
    for (let index = 0; index < 3; index += 1) {
      await work(other, specification);
    }

    await work(other, specification, { tasks: [] });
    const current = (await dependencies.store.read(SPEC)).specification;
    const switched = (await other.store.read(SPEC)).specification;
    if (!current || !switched) {
      throw new Error('No Specification run.');
    }

    await dependencies.store.apply(SPEC, {
      specification: { expected: current.revision, next: switched.value },
    });

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([
      {
        subject: specification,
        step: 'breakdown-review',
        reason: 'model-missing',
        archetype: 'reviewer',
        provider: 'codex',
      },
    ]);
  });

  it('follows the current archetypes: a chosen model turns the item into a continuation', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, agent('antigravity', 'session-g'));
    const withModel = memoryDependencies({
      ...catalogue,
      archetype: (id) => {
        const archetype = catalogue.archetype(id);

        return archetype && id === 'spec-writer'
          ? {
              ...archetype,
              providers: archetype.providers.map((entry) =>
                entry.provider === 'antigravity' ? { ...entry, model: 'gemini-x' } : entry,
              ),
            }
          : archetype;
      },
    });
    Object.assign(withModel, { store: dependencies.store });

    expect((await inspectExecution(withModel, SPEC)).attention).toEqual([]);
  });

  it('derives nothing for a run whose pinned workflow changed, and says so', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, agent('antigravity', 'session-g'));
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

    const inspection = await inspectExecution(edited, SPEC);
    expect(inspection.attention).toEqual([]);
    expect(inspection.specification?.definitionChanged).toBe(true);
    expect((await inspectExecution(dependencies, SPEC)).specification).not.toHaveProperty(
      'definitionChanged',
    );
  });

  it('shows nothing for a subject that is being worked on', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await work(dependencies, task('api'));
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { subject: task('api'), step: 'review' },
    ]);

    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
  });
});

describe('inspection during a mutation', () => {
  it('waits for the running mutation instead of reading half of it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const store: WorkflowStore = {
      read: (specId) => dependencies.store.read(specId),
      taskFiles: (specId, taskId) => dependencies.store.taskFiles(specId, taskId),
      apply: async (specId, change) => {
        await gate;

        return dependencies.store.apply(specId, change);
      },
    };
    const gated = { ...dependencies, store };

    const finishing = finishStep(gated, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      input: {},
      actor: claude,
    });
    const inspecting = inspectExecution(gated, SPEC);
    release();
    await finishing;

    expect((await inspecting).specification?.record.run.position).toEqual({
      state: 'ready',
      step: 'specification',
    });
  });
});
