import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowStore } from '../state/store';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
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

const NO_ATTENTION = { set: [], clear: [] };

describe('attention that no longer matches the state', () => {
  it('is not shown after the run was replaced by another checkout', async () => {
    const dependencies = memoryDependencies(catalogue);
    const antigravity = agent('antigravity', 'session-g');
    await startSpecification(dependencies, antigravity);
    const before = (await dependencies.store.read(SPEC)).specification;
    await finishStep(dependencies, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      input: {},
      executor: antigravity,
    });
    expect((await inspectExecution(dependencies, SPEC)).attention).toMatchObject([
      { step: 'specification', reason: 'model-missing' },
    ]);

    // A branch switch: the checkout now holds a run that is still on requirements.
    const after = (await dependencies.store.read(SPEC)).specification;
    if (!before || !after) {
      throw new Error('No Specification run.');
    }

    await dependencies.store.apply(SPEC, {
      specification: { expected: after.revision, next: before.value },
      tasks: [],
      attention: NO_ATTENTION,
    });

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
  });

  it('is removed by the next mutation of any subject of the Specification', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    // The Task "screen" has not started; an item for its review step is left over.
    await dependencies.store.apply(SPEC, {
      tasks: [],
      attention: {
        set: [
          {
            subject: task('screen'),
            step: 'review',
            reason: 'owner-action',
            createdAt: '2026-11-05T09:00:00.000Z',
          },
        ],
        clear: [],
      },
    });

    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual([]);
    await work(dependencies, task('api')); // a mutation of another subject
    const stored = (await dependencies.store.read(SPEC)).attention;
    expect(stored.map((item) => item.subject)).toEqual([task('api')]);
  });
});

describe('inspection during a mutation', () => {
  it('waits for the running mutation instead of reading half of it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const store: WorkflowStore = {
      read: (specId) => dependencies.store.read(specId),
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
      executor: claude,
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
