import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { resolveExecutionCatalogue } from '../definitions/catalogue';

import type { AttentionItem } from '../attention/model';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { ProjectControlLockError } from '../../project/control-lock';
import { SpecificationError } from '../../specs/model';
import { WorkflowError } from '../errors';
import {
  listingFailureOf,
  readExecution,
  readSpecificationListing,
  readSpecificationListings,
} from './execution-read';
import { inspectActions } from './actions';
import { abandonSpecification } from './abandon';
import { startTaskExecution } from './start';
import { inspectExecution } from './inspect';
import { finishStep } from './finish';
import {
  claude,
  memoryDependencies,
  owner,
  TWO_TASKS,
  work,
  seedDefinitionFiles,
  runToBreakdown,
  seedExecutionCatalogue,
  SPEC,
  specification,
  specificationWithTasks,
  task,
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

/**
 * The list read, checked against the Overview's own read of the same state: the same attention
 * count and the same Tasks ready to start (approved, not started, startable).
 */
const withoutStep = ({ step: _step, stepTitle: _title, ...item }: AttentionItem) => item;

async function listingAsOverview(dependencies: Parameters<typeof readExecution>[0]) {
  const listing = await readSpecificationListing(dependencies, SPEC);
  const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
  // The same items in the same order: the row names the one the Overview lists first. A start
  // blocker the list decides before the gates names no step (its action does not name one).
  expect(listing.attention.map(withoutStep)).toEqual(full.inspection.attention.map(withoutStep));
  expect(listing.tasks.readyToStart).toBe(
    [...full.facts.values()].filter(
      (fact) =>
        fact.preparation === 'ready' && fact.position.state === 'not-started' && fact.startable,
    ).length,
  );
  expect(listing.progress).toEqual(full.progress);

  return listing;
}

describe('readSpecificationListing', () => {
  it('says the Specification has not started before its first start', async () => {
    const { dependencies, create, decide } = scenario();
    await create('base');
    await decide('base', 'ready');

    expect(await listingAsOverview(dependencies)).toEqual({
      // The workflow its archetype (`feature`) would start.
      standing: { kind: 'not-started', steps: 7, firstStep: 'Gather requirements' },
      tasks: { open: 1, total: 1, inProgress: 0, readyToStart: 1 },
      attention: [],
      taskTitles: new Map([['base', 'base']]),
      progress: { completed: 0, total: 1, cancelled: 0, ended: 0, onHold: 0 },
      preparation: 'prepared',
    });
  });

  it('names the active step, its place in the workflow and who works on it', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);

    const listing = await listingAsOverview(dependencies);
    const { outline, position } = await inspectActions(dependencies, specification);
    if (position.kind !== 'active') {
      throw new Error('The run is not active.');
    }

    expect(listing.standing).toEqual({
      kind: 'step',
      state: 'active',
      step: {
        title: outline?.current?.title,
        position: outline?.current?.position,
        count: outline?.stepCount,
      },
      // The attempt the Overview's Now names: its number, since when and who works on it.
      attempt: {
        number: position.attempt.number,
        startedAt: position.attempt.startedAt,
        actor: position.attempt.actor,
      },
    });
    expect(listing.standing).toMatchObject({ attempt: { actor: { class: 'agent' } } });
    expect(listing.attention).toEqual([]);
  });

  it('counts the Tasks of a wait step as the Overview groups them, with the same attention', async () => {
    const { dependencies, decide } = scenario();
    await specificationWithTasks(dependencies);

    const waiting = await listingAsOverview(dependencies);
    const projection = await inspectActions(dependencies, specification);
    expect(projection.position.kind).toBe('waiting');
    expect(waiting.standing).toMatchObject({
      kind: 'step',
      state: 'waiting',
      step: { position: projection.outline?.current?.position },
    });
    // `screen` waits for `api`: only `api` can start.
    expect(waiting.tasks).toEqual({ open: 2, total: 2, inProgress: 0, readyToStart: 1 });
    expect(waiting.attention).toEqual([]);

    await decide('api', 'on-hold');
    const stuck = await listingAsOverview(dependencies);
    const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(stuck.attention.map(withoutStep)).toEqual(full.inspection.attention.map(withoutStep));
    expect(stuck.attention.length).toBeGreaterThan(0);
    expect(stuck.tasks).toEqual({ open: 2, total: 2, inProgress: 0, readyToStart: 0 });
  });

  it('decides a Task blocked twice by its most fundamental blocker, as the Overview does', async () => {
    const { dependencies, create, decide } = scenario();
    dependencies.references.paths.add('src/gone.ts');
    dependencies.references.paths.add('src/missing.ts');
    await create('dropped');
    await create('base');
    await create('context', {
      dependsOn: ['dropped'],
      context: [{ kind: 'path', path: 'src/gone.ts', required: true }],
    });
    await create('waiting', {
      dependsOn: ['base'],
      context: [{ kind: 'path', path: 'src/missing.ts', required: true }],
    });
    for (const taskId of ['dropped', 'context', 'waiting', 'base']) {
      await decide(taskId, 'ready');
    }

    await decide('dropped', 'cancelled');
    dependencies.references.paths.delete('src/missing.ts');
    const listing = await listingAsOverview(dependencies);
    // `context` cannot ever start (its dependency was cancelled); `waiting` lacks its context.
    expect(listing.attention.map((item) => item.reason)).toEqual([
      'dependency-unsatisfiable',
      'context-unresolved',
    ]);
    expect(listing.tasks.readyToStart).toBe(1);
  });

  it('counts a started Task as in progress and an unresolved context as attention', async () => {
    const { dependencies, create, decide } = scenario();
    dependencies.references.paths.add('src/gone.ts');
    await create('context', { context: [{ kind: 'path', path: 'src/gone.ts', required: true }] });
    await decide('context', 'ready');
    await create('base');
    await decide('base', 'ready');
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'base', actor: owner });

    const listing = await listingAsOverview(dependencies);
    const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
    expect(listing.tasks).toMatchObject({ inProgress: 1 });
    expect(listing.attention.map(withoutStep)).toEqual(full.inspection.attention.map(withoutStep));
    expect(full.facts.get('context')?.startable).toBe(listing.tasks.readyToStart === 1);
  });

  it('says how the run ended', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);
    await abandonSpecification(dependencies, { specId: SPEC, reason: 'Not needed.', actor: owner });

    const { standing } = await listingAsOverview(dependencies);
    expect(standing).toMatchObject({ kind: 'ended', outcome: 'abandoned', steps: 7 });
    // When it was abandoned: the run's own record.
    expect(standing.kind === 'ended' && Date.parse(standing.abandonedAt ?? '')).toBeGreaterThan(0);
  });

  it('reads the documents of an entry gate only for a Task nothing else keeps from starting', async () => {
    // The first step of the seed Task workflow needs a `note` of the Specification to start.
    const files = await seedDefinitionFiles();
    files['workflow/task-standard.yaml'] = (files['workflow/task-standard.yaml'] ?? '').replace(
      "    purpose: The Task's change works and stays within its scope.\n",
      [
        "    purpose: The Task's change works and stays within its scope.",
        '    entryGates:',
        '      - type: document',
        '        documentType: note',
        '        scope: specification',
        '',
      ].join('\n'),
    );
    const gated = resolveExecutionCatalogue(
      await loadDefinitions(new MemoryDefinitionSource(files), createDefaultDefinitionRegistry()),
    );
    const dependencies = memoryDependencies(gated);
    for (const [taskId, dependsOn] of [
      ['first', []],
      ['second', ['first']],
      ['third', ['first']],
    ] as const) {
      await createTask(dependencies, {
        specId: SPEC,
        taskId,
        title: taskId,
        type: 'implementation',
        actor: owner,
        dependsOn: [...dependsOn],
      });
      await setTaskStatus(dependencies, { specId: SPEC, taskId, status: 'ready', actor: owner });
    }

    dependencies.references.gateReads = 0;
    const listing = await readSpecificationListing(dependencies, SPEC);
    const listReads = dependencies.references.gateReads;
    // `second` and `third` wait for `first`: their gate decides nothing yet and is not read.
    expect(listReads).toBe(1);
    expect(listing).toMatchObject({ attention: [{ reason: 'entry-gate-unsatisfied' }] });
    expect(listing.tasks.readyToStart).toBe(0);
    dependencies.references.gateReads = 0;
    await listingAsOverview(dependencies);
    expect(dependencies.references.gateReads).toBeGreaterThan(listReads);
  });
});

describe('readSpecificationListing between attempts', () => {
  it('says what the last attempt handed over, as the Overview names it', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    // The owner's review requests changes: the run goes back to the breakdown, ready to start.
    await work(dependencies, specification, { result: 'fail', feedback: 'Split the API.' }, owner);

    const listing = await listingAsOverview(dependencies);
    const projection = await inspectActions(dependencies, specification);
    expect(listing.standing).toMatchObject({ kind: 'step', state: 'ready' });
    expect(listing.standing).toMatchObject({ handoff: projection.handoff });
    expect(projection.handoff).toMatchObject({ kind: 'transition', result: 'fail' });
  });
});

describe('readSpecificationListings', () => {
  it('holds the project lock only while it reads each Specification snapshot', async () => {
    const { dependencies, create, decide } = scenario();
    await create('base');
    await decide('base', 'ready');
    const sections: string[] = [];
    let held = false;
    const lookups: boolean[] = [];
    const watched = {
      ...dependencies,
      serialize: <T>(operation: () => Promise<T>) =>
        dependencies.serialize(async () => {
          held = true;
          try {
            const result = await operation();
            sections.push('snapshot');

            return result;
          } finally {
            held = false;
          }
        }),
      references: {
        ...dependencies.references,
        archetype: (specId: string) => {
          lookups.push(held);

          return dependencies.references.archetype(specId);
        },
        documentsOfType: (...args: Parameters<typeof dependencies.references.documentsOfType>) => {
          lookups.push(held);

          return dependencies.references.documentsOfType(...args);
        },
      },
    };

    const listings = await readSpecificationListings(watched, [SPEC, SPEC, SPEC]);
    expect(listings.get(SPEC)).toMatchObject({ kind: 'read', listing: { attention: [] } });
    // One short section per Specification read, nothing else under the lock.
    expect(sections).toEqual(['snapshot', 'snapshot', 'snapshot']);
    expect(lookups.length).toBeGreaterThan(0);
    expect(lookups.every((insideLock) => !insideLock)).toBe(true);
  });

  it('says why a Specification cannot be read and still reads the others', async () => {
    const { dependencies } = scenario();
    const failing = new Map<string, Error>([
      ['corrupt', new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The run does not follow.')],
      ['manifest', new SpecificationError('SPEC_SOURCE_INVALID', 'Invalid manifest.')],
      ['denied', Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })],
      ['busy', new ProjectControlLockError('CONTROL_LOCK_BUSY', 'Busy.')],
      ['defect', new TypeError('Cannot read properties of undefined')],
    ]);
    const store = {
      ...dependencies.store,
      read: (specId: string) => {
        const error = failing.get(specId);

        return error ? Promise.reject(error) : dependencies.store.read(specId);
      },
    };

    const listings = await readSpecificationListings({ ...dependencies, store }, [
      'corrupt',
      'manifest',
      'denied',
      'defect',
      SPEC,
      'busy',
    ]);
    const reasons = Object.fromEntries(
      [...listings].map(([specId, read]) => [specId, read.kind === 'read' ? 'read' : read.reason]),
    );
    expect(reasons).toEqual({
      corrupt: 'invalid',
      manifest: 'invalid',
      denied: 'filesystem',
      busy: 'busy',
      defect: 'unexpected',
      [SPEC]: 'read',
    });
    // The caller gets the error itself, to log what it did not expect.
    expect(listings.get('defect')).toMatchObject({ error: failing.get('defect') });
    expect(listingFailureOf(new Error('no code'))).toBe('unexpected');
  });

  it('waits for a busy control lock once per list read: the rest answer busy at once', async () => {
    const { dependencies } = scenario();
    const reads: string[] = [];
    const store = {
      ...dependencies.store,
      read: (specId: string) => {
        reads.push(specId);

        return specId === 'busy'
          ? Promise.reject(new ProjectControlLockError('CONTROL_LOCK_BUSY', 'Busy.'))
          : dependencies.store.read(specId);
      },
    };

    const listings = await readSpecificationListings({ ...dependencies, store }, [
      SPEC,
      'busy',
      'after-1',
      'after-2',
    ]);
    expect(reads).toEqual([SPEC, 'busy']);
    expect(listings.get(SPEC)?.kind).toBe('read');
    expect(listings.get('after-1')).toMatchObject({ kind: 'unreadable', reason: 'busy' });
    expect(listings.get('after-2')).toMatchObject({ kind: 'unreadable', reason: 'busy' });
  });
});

/**
 * The list row and the Overview's Now of the same state: the step, its place among the steps, the
 * attempt, the hand-off and the outcome the list carries are the projection's own.
 */
async function agreesWithNow(dependencies: Parameters<typeof readExecution>[0]) {
  const listing = await listingAsOverview(dependencies);
  const projection = await inspectActions(dependencies, specification);
  const { position, outline } = projection;
  const step = outline?.current
    ? { title: outline.current.title, position: outline.current.position, count: outline.stepCount }
    : undefined;
  switch (position.kind) {
    case 'not-started':
      expect(listing.standing).toEqual({
        kind: 'not-started',
        steps: outline?.stepCount,
        firstStep: position.preview.firstStepTitle,
      });
      break;
    case 'active':
      expect(listing.standing).toEqual({
        kind: 'step',
        state: 'active',
        step,
        attempt: {
          number: position.attempt.number,
          startedAt: position.attempt.startedAt,
          actor: position.attempt.actor,
        },
      });
      break;
    case 'ready':
      expect(listing.standing).toEqual({
        kind: 'step',
        state: 'ready',
        step,
        ...(projection.handoff ? { handoff: projection.handoff } : {}),
      });
      break;
    case 'waiting':
      expect(listing.standing).toEqual({ kind: 'step', state: 'waiting', step });
      break;
    case 'terminal':
      expect(listing.standing).toMatchObject({
        kind: 'ended',
        outcome: position.outcome,
        steps: outline?.stepCount,
        ...(position.abandonment ? { abandonedAt: position.abandonment.at } : {}),
      });
      break;
    default:
      throw new Error(`Not a state of this test: ${position.kind}.`);
  }

  return { listing, projection };
}

describe('the list row and the Overview agree', () => {
  it('before the first start', async () => {
    const { dependencies } = scenario();
    expect((await agreesWithNow(dependencies)).listing.standing.kind).toBe('not-started');
  });

  it('while an agent works on a step', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);
    const { listing } = await agreesWithNow(dependencies);
    expect(listing.standing).toMatchObject({ attempt: { actor: { class: 'agent' } } });
  });

  it('after a review requested changes', async () => {
    const { dependencies } = scenario();
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    await work(dependencies, specification, { result: 'fail', feedback: 'Split it.' }, owner);
    const { projection } = await agreesWithNow(dependencies);
    expect(projection.handoff).toMatchObject({ result: 'fail' });
  });

  it('while the Specification waits for its Tasks, and once a Task holds it up', async () => {
    const { dependencies, decide } = scenario();
    await specificationWithTasks(dependencies);
    const waiting = await agreesWithNow(dependencies);
    expect(waiting.listing.attention).toEqual([]);

    await decide('api', 'on-hold');
    const held = await agreesWithNow(dependencies);
    const full = await readExecution(dependencies, SPEC, { tasks: 'all' });
    // The row names the item the Overview's Requires attention lists first.
    expect(held.listing.attention[0]).toEqual(full.inspection.attention[0]);
    expect(typeof held.listing.attention[0]?.action).toBe('string');
  });

  it('once the run completed or was abandoned', async () => {
    const completed = scenario().dependencies;
    await specificationWithTasks(completed);
    for (const id of ['api', 'screen']) {
      await work(completed, task(id));
      await work(completed, task(id), { result: 'pass' });
    }

    await work(completed, specification, {}, owner);
    expect((await agreesWithNow(completed)).listing.progress).toMatchObject({
      completed: 2,
      total: 2,
    });

    const abandoned = scenario().dependencies;
    await runToBreakdown(abandoned);
    await abandonSpecification(abandoned, { specId: SPEC, reason: 'Not needed.', actor: owner });
    expect((await agreesWithNow(abandoned)).listing.standing).toMatchObject({
      outcome: 'abandoned',
    });
  });
});
