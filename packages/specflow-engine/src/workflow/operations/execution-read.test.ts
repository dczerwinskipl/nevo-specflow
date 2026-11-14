import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { readExecution } from './execution-read';
import { inspectExecution } from './inspect';
import {
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  SPEC,
  specificationWithTasks,
} from './operations.test-support';
import { createTask, editTask } from './task-resource';
import { setTaskStatus } from './task-status';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

function scenario() {
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

  return { dependencies, create, decide };
}

describe('readExecution', () => {
  it('derives neutral facts and only the attention a person has to act on', async () => {
    const { dependencies, create, decide } = scenario();

    expect(await readExecution(dependencies, SPEC, { tasks: 'all' })).toMatchObject({
      progress: { completed: 0, total: 0, cancelled: 0, ended: 0, onHold: 0 },
      preparation: 'empty',
      inspection: { attention: [] },
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
    const facts = (taskId: string) => reading.facts.get(taskId);

    // Ready to start: no blocker, no attention.
    expect(facts('base')).toMatchObject({
      preparation: 'ready',
      position: { state: 'not-started' },
      startable: true,
      startBlockers: [],
    });
    expect(facts('base')?.attention).toBeUndefined();
    // Normal dependency wait: not attention.
    expect(facts('after')).toMatchObject({
      startable: false,
      dependencyWait: { waitingFor: ['base'], unsatisfiable: [] },
    });
    expect(facts('after')?.attention).toBeUndefined();
    // A draft and a Task on hold are not attention per Task.
    expect(facts('draft')).toMatchObject({ preparation: 'draft', startable: false });
    expect(facts('draft')?.attention).toBeUndefined();
    expect(facts('held')).toMatchObject({ preparation: 'on-hold', escalated: false });
    expect(facts('held')?.attention).toBeUndefined();
    expect(facts('dropped')?.attention).toBeUndefined();
    // Actionable start blockers of approved, not-started Tasks are attention.
    expect(facts('stuck')?.attention).toMatchObject({
      reason: 'dependency-unsatisfiable',
      actor: 'owner',
      action: 'edit-dependencies',
      taskIds: ['dropped'],
    });
    expect(facts('context')?.attention).toMatchObject({
      reason: 'context-unresolved',
      actor: 'owner',
      action: 'edit-context',
      step: 'implement',
    });
    expect(facts('context')?.attention?.message).toContain(
      '1 required context entry does not resolve',
    );
    expect(reading.inspection.attention.map((item) => item.reason)).toEqual([
      'context-unresolved',
      'dependency-unsatisfiable',
    ]);
    // One source: the inspection alone, and a read of no Task, carry the same items.
    expect((await inspectExecution(dependencies, SPEC)).attention).toEqual(
      reading.inspection.attention,
    );
    expect((await readExecution(dependencies, SPEC, { tasks: [] })).inspection.attention).toEqual(
      reading.inspection.attention,
    );
    expect(reading.progress).toEqual({
      completed: 0,
      total: 6,
      cancelled: 1,
      ended: 0,
      onHold: 1,
    });
    expect(reading.preparation).toBe('preparing');
    expect(reading.actions.get('base')?.position.kind).toBe('not-started');

    const one = await readExecution(dependencies, SPEC, { tasks: ['after'] });
    expect([...one.actions.keys()]).toEqual(['after']);
    expect([...one.facts.keys()]).toEqual(['after']);
    expect(one.progress).toEqual(reading.progress);
  });

  it('clears the attention once the blocker is fixed and updates the facts after a decision', async () => {
    const { dependencies, create, decide } = scenario();
    dependencies.references.paths.add('src/gone.ts');
    await create('context', { context: [{ kind: 'path', path: 'src/gone.ts', required: true }] });
    await decide('context', 'ready');
    dependencies.references.paths.delete('src/gone.ts');
    const before = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(before.facts.get('context')?.attention?.reason).toBe('context-unresolved');

    // The referenced path exists again: nothing to do, the Task is startable.
    dependencies.references.paths.add('src/gone.ts');
    const fixed = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(fixed.facts.get('context')).toMatchObject({ startable: true, startBlockers: [] });
    expect(fixed.inspection.attention).toEqual([]);

    // Removing the entry fixes it too.
    dependencies.references.paths.delete('src/gone.ts');
    const revision = (await readExecution(dependencies, SPEC, { tasks: [] })).inspection.tasks[0]!
      .revision;
    await editTask(dependencies, {
      specId: SPEC,
      taskId: 'context',
      expectedRevision: revision,
      context: [],
      actor: owner,
    });
    expect(
      (await readExecution(dependencies, SPEC, { tasks: 'all' })).inspection.attention,
    ).toEqual([]);

    await decide('context', 'on-hold');
    expect(
      (await readExecution(dependencies, SPEC, { tasks: 'all' })).facts.get('context'),
    ).toMatchObject({ preparation: 'on-hold', startable: false });
  });

  it('names the blocking Task of a stuck wait and clears it once the Task is resumed', async () => {
    const { dependencies, decide } = scenario();
    await specificationWithTasks(dependencies);
    await decide('api', 'on-hold');

    const stuck = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(stuck.inspection.attention).toEqual([
      expect.objectContaining({
        subject: { kind: 'specification', specId: SPEC },
        reason: 'tasks-stuck',
        action: 'review-tasks',
        taskIds: ['api'],
        blocking: [{ taskId: 'api', cause: 'on-hold' }],
      }),
    ]);
    // Waiting for the held Task is not attention of its own.
    expect(stuck.facts.get('screen')?.attention).toBeUndefined();

    await decide('api', 'ready');
    expect(
      (await readExecution(dependencies, SPEC, { tasks: 'all' })).inspection.attention,
    ).toEqual([]);
  });
});
