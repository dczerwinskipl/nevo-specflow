import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { readExecution, readSpecificationListing } from './execution-read';
import { inspectActions } from './actions';
import { abandonSpecification } from './abandon';
import { startTaskExecution } from './start';
import { inspectExecution } from './inspect';
import {
  memoryDependencies,
  owner,
  runToBreakdown,
  seedExecutionCatalogue,
  SPEC,
  specification,
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

describe('readSpecificationListing', () => {
  it('says the Specification has not started before its first start', async () => {
    const { dependencies, create, decide } = scenario();
    await create('base');
    await decide('base', 'ready');

    expect(await readSpecificationListing(dependencies, SPEC)).toEqual({
      standing: { kind: 'not-started' },
      tasks: { open: 1, total: 1, inProgress: 0, readyToStart: 1 },
      attention: 0,
      progress: { completed: 0, total: 1, cancelled: 0, ended: 0, onHold: 0 },
      preparation: 'prepared',
    });
  });

  it('names the active step, its place in the workflow and who works on it', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);

    const listing = await readSpecificationListing(dependencies, SPEC);
    const outline = (await inspectActions(dependencies, specification)).outline;
    expect(listing.standing).toEqual({
      kind: 'step',
      state: 'active',
      step: {
        title: outline?.current?.title,
        position: outline?.current?.position,
        count: outline?.stepCount,
      },
      actor: 'agent',
    });
    expect(listing.attention).toBe(0);
  });

  it('counts the Tasks of a wait step as the Overview groups them, with the same attention', async () => {
    const { dependencies, decide } = scenario();
    await specificationWithTasks(dependencies);

    const waiting = await readSpecificationListing(dependencies, SPEC);
    const projection = await inspectActions(dependencies, specification);
    expect(projection.position.kind).toBe('waiting');
    expect(waiting.standing).toMatchObject({
      kind: 'step',
      state: 'waiting',
      step: { position: projection.outline?.current?.position },
    });
    // `screen` waits for `api`: only `api` can start.
    expect(waiting.tasks).toEqual({ open: 2, total: 2, inProgress: 0, readyToStart: 1 });
    expect(waiting.attention).toBe(0);

    await decide('api', 'on-hold');
    const stuck = await readSpecificationListing(dependencies, SPEC);
    const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(stuck.attention).toBe(full.inspection.attention.length);
    expect(stuck.attention).toBeGreaterThan(0);
    expect(stuck.tasks).toEqual({ open: 2, total: 2, inProgress: 0, readyToStart: 0 });
  });

  it('counts a started Task as in progress and an unresolved context as attention', async () => {
    const { dependencies, create, decide } = scenario();
    dependencies.references.paths.add('src/gone.ts');
    await create('context', { context: [{ kind: 'path', path: 'src/gone.ts', required: true }] });
    await decide('context', 'ready');
    await create('base');
    await decide('base', 'ready');
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'base', actor: owner });

    const listing = await readSpecificationListing(dependencies, SPEC);
    const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(listing.tasks).toMatchObject({ inProgress: 1 });
    expect(listing.attention).toBe(full.inspection.attention.length);
    expect(full.facts.get('context')?.startable).toBe(listing.tasks.readyToStart === 1);
  });

  it('says how the run ended', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);
    await abandonSpecification(dependencies, { specId: SPEC, reason: 'Not needed.', actor: owner });

    expect((await readSpecificationListing(dependencies, SPEC)).standing).toEqual({
      kind: 'ended',
      outcome: 'abandoned',
    });
  });
});
