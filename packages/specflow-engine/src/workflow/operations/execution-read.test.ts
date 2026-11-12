import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { readExecution } from './execution-read';
import { memoryDependencies, owner, seedExecutionCatalogue, SPEC } from './operations.test-support';
import { createTask } from './task-resource';
import { setTaskStatus } from './task-status';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

describe('readExecution', () => {
  it('derives lanes, progress and preparation from one snapshot and the action projections', async () => {
    const dependencies = memoryDependencies(catalogue);
    const create = (taskId: string, extra: Record<string, unknown> = {}) =>
      createTask(dependencies, {
        specId: SPEC,
        taskId,
        title: taskId,
        type: 'implementation',
        actor: owner,
        ...extra,
      });
    const decide = (taskId: string, status: 'ready' | 'on-hold' | 'cancelled') =>
      setTaskStatus(dependencies, { specId: SPEC, taskId, status, actor: owner });

    expect(await readExecution(dependencies, SPEC, { tasks: 'all' })).toMatchObject({
      progress: { completed: 0, total: 0 },
      preparation: 'empty',
    });

    await create('base');
    await create('after', { dependsOn: ['base'] });
    await create('dropped');
    await create('stuck', { dependsOn: ['dropped'] });
    await create('draft');
    await create('held');
    for (const taskId of ['base', 'after', 'dropped', 'stuck', 'held']) {
      await decide(taskId, 'ready');
    }

    await decide('dropped', 'cancelled');
    await decide('held', 'on-hold');
    // An unresolved required context entry blocks a first start; the Task is not merely waiting.
    dependencies.references.paths.add('src/gone.ts');
    await create('context', { context: [{ kind: 'path', path: 'src/gone.ts', required: true }] });
    await decide('context', 'ready');
    dependencies.references.paths.delete('src/gone.ts');

    const reading = await readExecution(dependencies, SPEC, { tasks: 'all' });

    expect(Object.fromEntries(reading.lanes)).toEqual({
      base: 'ready',
      after: 'waiting',
      dropped: 'cancelled',
      // Its dependency was cancelled: it can never start.
      stuck: 'blocked',
      draft: 'needs-approval',
      held: 'held',
      context: 'blocked',
    });
    expect(reading.progress).toEqual({ completed: 0, total: 6 });
    expect(reading.preparation).toBe('preparing');
    expect(reading.actions.get('base')?.position.kind).toBe('not-started');

    const one = await readExecution(dependencies, SPEC, { tasks: ['after'] });
    expect([...one.actions.keys()]).toEqual(['after']);
    expect(one.progress).toEqual(reading.progress);
  });
});
