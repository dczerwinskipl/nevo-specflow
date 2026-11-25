import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../definitions/shipped-registry';
import { loadDefinitions } from '../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../specs/definitions/test-support';
import { closeBlockers } from '../close/blockers';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions, type ActionDependencies, type ActionProjection } from './actions';
import {
  SPEC,
  agent,
  claude,
  memoryDependencies,
  owner,
  runToBreakdown,
  seedDefinitionFiles,
  seedExecutionCatalogue,
  TWO_TASKS,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
  work,
  type Dependencies,
} from './operations.test-support';
import { guardTaskDocumentChanges } from '../state/task-document-guard';
import { finishStep } from './finish';
import { startTaskExecution } from './start';
import { abandonSpecification } from './abandon';
import { readSpecificationExitState } from './specification-exit';
import { createTask, editTask, removeTask, type CreateTaskInput } from './task-resource';
import { setTaskStatus } from './task-status';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

/** The projection of a subject; it never writes (the memory store records every apply). */
async function project(
  dependencies: Dependencies,
  subject: Parameters<typeof inspectActions>[1],
  extra: Partial<ActionDependencies> = {},
): Promise<ActionProjection> {
  const applied = dependencies.store.applied.length;
  const projection = await inspectActions({ ...dependencies, ...extra }, subject);
  expect(dependencies.store.applied).toHaveLength(applied);

  return projection;
}

const create = (
  dependencies: Dependencies,
  taskId: string,
  overrides: Partial<CreateTaskInput> = {},
) =>
  createTask(dependencies, {
    specId: SPEC,
    taskId,
    title: taskId.toUpperCase(),
    type: 'implementation',
    actor: owner,
    ...overrides,
  });

const decide = (
  dependencies: Dependencies,
  taskId: string,
  status: 'ready' | 'on-hold' | 'cancelled',
) => setTaskStatus(dependencies, { specId: SPEC, taskId, status, actor: owner });

const ALLOWED = { kind: 'allowed' };
const no = (reason: string) => ({ kind: 'unavailable', reason });

describe('Specification positions', () => {
  it('not started: previews the pin of the archetype binding; the owner may start it', async () => {
    const dependencies = memoryDependencies(catalogue);
    const projection = await project(dependencies, specification);
    const workflow = catalogue.workflow('specification-standard');

    expect(projection).toMatchObject({
      workflow: { workflowId: 'specification-standard', version: workflow?.version },
      position: {
        kind: 'not-started',
        preview: {
          workflowId: 'specification-standard',
          title: workflow?.title,
          firstStep: 'requirements',
        },
        next: { step: { id: 'requirements' }, human: true, agent: { kind: 'available' } },
      },
      actions: { start: { step: 'requirements', firstStart: true } },
      specification: { createTask: ALLOWED },
    });
    expect(projection.actions.start).not.toHaveProperty('expectedWorkflowRevision');
    expect(projection.specification).not.toHaveProperty('exit');
    // The task types a new Task may have, with the work steps of their Task workflow.
    const implementation = catalogue.taskType('implementation');
    const option = projection.specification?.taskTypes.find(
      (candidate) => candidate.id === 'implementation',
    );
    expect(option).toMatchObject({
      title: implementation?.title,
      workflow: { id: implementation?.workflow },
    });
    expect(option?.workflow.steps.length).toBeGreaterThan(0);
  });

  it('refuses a first start when the archetype has no usable binding', async () => {
    const dependencies = memoryDependencies({
      ...catalogue,
      specificationExecution: () => undefined,
    });

    expect(await project(dependencies, specification)).toMatchObject({
      position: { kind: 'blocked', blockers: [{ kind: 'not-configured' }] },
      actions: {},
    });
  });

  it('active: the owner finishes their own attempt with the declared transitions and may return', async () => {
    const dependencies = memoryDependencies(catalogue);
    await work(dependencies, specification, {}, owner);
    await startSpecification(dependencies, owner);

    expect(await project(dependencies, specification)).toMatchObject({
      position: {
        kind: 'active',
        step: { id: 'specification' },
        attempt: { number: 1, actor: owner },
      },
      handoff: {
        kind: 'transition',
        // Who finished it and when, for the owner's "Last:" line.
        from: {
          step: 'requirements',
          title: expect.any(String) as string,
          actor: owner,
          at: expect.any(String) as string,
        },
        transition: 'agreed',
      },
      actions: {
        finish: {
          step: 'specification',
          attempt: 1,
          transitions: [
            { id: 'written', target: { kind: 'step', step: 'solution' }, feedback: 'optional' },
          ],
        },
        return: {
          targets: [
            { step: 'requirements', feedback: expect.any(String) as unknown },
            { step: 'specification', feedback: expect.any(String) as unknown },
          ],
        },
      },
    });
  });

  it("active: an agent's attempt offers no finish to the owner", async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies, claude);
    const projection = await project(dependencies, specification);

    expect(projection.position).toMatchObject({ kind: 'active', attempt: { actor: claude } });
    expect(projection.actions).not.toHaveProperty('finish');
  });

  it('D10: after a person finished into a `session: reuse` transition, the agent option is session-unavailable', async () => {
    const byHand = memoryDependencies(catalogue);
    await work(byHand, specification, {}, owner);
    expect(await project(byHand, specification)).toMatchObject({
      position: {
        kind: 'ready',
        next: {
          step: { id: 'specification' },
          human: true,
          agent: { kind: 'unavailable', reason: 'session-unavailable' },
        },
      },
      actions: { start: { step: 'specification', firstStart: false } },
    });

    const byAgent = memoryDependencies(catalogue);
    await work(byAgent, specification, {}, claude);
    expect((await project(byAgent, specification)).position).toMatchObject({
      kind: 'ready',
      next: { agent: { kind: 'available' } },
    });
  });

  it('active producing step: lists the drafts it produced earlier, so a person can keep them (D06)', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    await work(dependencies, specification, { result: 'fail', feedback: 'Split it.' });
    await startSpecification(dependencies, owner);

    expect((await project(dependencies, specification)).actions.finish).toMatchObject({
      step: 'breakdown',
      attempt: 2,
      drafts: [
        { id: 'api', title: 'API', type: 'implementation' },
        { id: 'screen', title: 'Screen', type: 'ui-implementation', dependsOn: ['api'] },
      ],
    });
  });

  it('ready after a review requested changes: the handoff names the review, its outcome and its feedback', async () => {
    const dependencies = memoryDependencies(catalogue);
    await runToBreakdown(dependencies);
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    await work(dependencies, specification, { result: 'fail', feedback: 'Split the API Task.' });

    const projection = await project(dependencies, specification);
    expect(projection.position).toMatchObject({
      kind: 'ready',
      next: { step: { id: 'breakdown' } },
    });
    expect(projection.handoff).toMatchObject({
      kind: 'transition',
      from: { step: 'breakdown-review', attempt: 1, title: 'Review the breakdown' },
      transition: 'changes-requested',
      label: 'Changes requested',
      result: 'fail',
      feedback: 'Split the API Task.',
    });
  });

  it('waiting: reports the wait step and the Tasks it waits for', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await decide(dependencies, 'screen', 'cancelled');

    const projection = await project(dependencies, specification);
    expect(projection.position).toEqual({
      kind: 'waiting',
      step: expect.objectContaining({ id: 'implementation', kind: 'wait' }) as unknown,
      blockingTasks: { count: 1, ids: ['api'] },
      totalTasks: 2,
    });
    expect(projection.actions).not.toHaveProperty('finish');
    expect(projection.actions).not.toHaveProperty('start');
    expect(projection.actions.return?.targets.map((target) => target.step)).toContain('breakdown');
  });

  it('passes the snapshot to the Close/Abandon port (T6) and reports its answer', async () => {
    const dependencies = memoryDependencies(catalogue);
    const exit = { close: { kind: 'allowed' as const }, abandon: { kind: 'allowed' as const } };
    const seen: string[] = [];
    const projection = await project(dependencies, specification, {
      specificationExit: {
        exitActions: (snapshot) => {
          seen.push(snapshot.specId);

          return Promise.resolve(exit);
        },
      },
    });

    expect(seen).toEqual([SPEC]);
    expect(projection.specification?.exit).toEqual(exit);
  });
});

describe('Task positions', () => {
  it('a draft is blocked by its status; its pin preview and lifecycle actions are reported', async () => {
    const dependencies = memoryDependencies(catalogue);
    const created = await create(dependencies, 'api');
    const workflow = catalogue.workflow('task-standard');

    expect(await project(dependencies, task('api'))).toEqual({
      subject: task('api'),
      workflow: {
        workflowId: 'task-standard',
        version: workflow?.version,
        revision: expect.any(String) as unknown,
        title: workflow?.title,
      },
      position: {
        kind: 'blocked',
        blockers: [{ kind: 'status', status: 'draft' }],
        preview: expect.objectContaining({
          workflowId: 'task-standard',
          firstStep: 'implement',
        }) as unknown,
        next: expect.objectContaining({
          human: true,
          agent: {
            kind: 'available',
            launch: {
              archetype: 'implementer',
              provider: 'claude',
              model: 'claude-sonnet-5-5',
              session: { mode: 'fresh' },
            },
          },
        }) as unknown,
      },
      actions: {},
      documentRelations: [],
      task: {
        revision: created.revision,
        approve: ALLOWED,
        hold: no('status'),
        resume: no('status'),
        cancel: ALLOWED,
        remove: ALLOWED,
        editDetails: ALLOWED,
        editContext: ALLOWED,
        editDependencies: ALLOWED,
      },
      // The default context (no explicit list): task.md and the Specification overview, required.
      taskAuthoring: {
        context: {
          isDefault: true,
          entries: [
            { entry: { kind: 'task-document', id: 'task', required: true }, state: 'resolved' },
            {
              entry: { kind: 'specification-document', id: 'overview', required: true },
              state: 'resolved',
            },
          ],
          defaultEntries: [
            { kind: 'task-document', id: 'task', required: true },
            { kind: 'specification-document', id: 'overview', required: true },
          ],
        },
        dependencyCandidates: [],
      },
    });
  });

  it('lists dependency candidates with the reason one cannot be added', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await create(dependencies, 'ui', { dependsOn: ['api'] });
    await create(dependencies, 'docs');
    await create(dependencies, 'old');
    await decide(dependencies, 'old', 'cancelled');

    expect((await project(dependencies, task('api'))).taskAuthoring?.dependencyCandidates).toEqual([
      { taskId: 'ui', unavailable: 'would-create-cycle' },
      { taskId: 'docs' },
      { taskId: 'old', unavailable: 'cancelled' },
    ]);
    expect((await project(dependencies, task('ui'))).taskAuthoring?.dependencyCandidates).toEqual([
      { taskId: 'api', unavailable: 'dependency' },
      { taskId: 'docs' },
      { taskId: 'old', unavailable: 'cancelled' },
    ]);
  });

  it('a ready Task offers its first start with the previewed revision, which the start accepts', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');

    const projection = await project(dependencies, task('api'));
    if (projection.position.kind !== 'not-started') {
      throw new Error('Expected a not-started Task.');
    }

    expect(projection.actions.start).toEqual({
      step: 'implement',
      firstStart: true,
      expectedWorkflowRevision: projection.position.preview.revision,
    });
    expect(projection.task).toMatchObject({ approve: no('status'), hold: ALLOWED });
    await expect(
      startTaskExecution(dependencies, {
        specId: SPEC,
        taskId: 'api',
        actor: owner,
        expectedWorkflowRevision: projection.actions.start?.expectedWorkflowRevision ?? '',
      }),
    ).resolves.toMatchObject({ kind: 'started' });
  });

  it('reports unfinished and unsatisfiable dependencies, and the dependents that keep a removal', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await create(dependencies, 'screen', { dependsOn: ['api'] });
    await decide(dependencies, 'api', 'ready');
    await decide(dependencies, 'screen', 'ready');

    expect((await project(dependencies, task('screen'))).position).toMatchObject({
      kind: 'blocked',
      blockers: [{ kind: 'dependencies', waitingFor: ['api'], unsatisfiable: [] }],
    });
    expect((await project(dependencies, task('api'))).task?.remove).toEqual({
      kind: 'unavailable',
      reason: 'has-dependents',
      taskIds: ['screen'],
    });

    await decide(dependencies, 'api', 'cancelled');
    expect((await project(dependencies, task('screen'))).position).toMatchObject({
      blockers: [{ kind: 'dependencies', waitingFor: ['api'], unsatisfiable: ['api'] }],
    });
  });

  it('a removal is unavailable while the Task folder holds a file it does not register', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await dependencies.store.apply(SPEC, {
      documents: [{ taskId: 'api', path: 'notes.txt', text: 'mine' }],
    });

    expect((await project(dependencies, task('api'))).task?.remove).toEqual({
      kind: 'unavailable',
      reason: 'unregistered-files',
      files: ['notes.txt'],
    });
  });

  it('a cancelled Task: cancelling again and editing are unavailable as cancelled', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'cancelled');

    expect((await project(dependencies, task('api'))).task).toMatchObject({
      approve: no('status'),
      cancel: no('cancelled'),
      editDetails: no('cancelled'),
      remove: ALLOWED,
    });
  });

  it('during an active attempt: Hold and Cancel are unavailable with a reason, dependencies are fixed', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: owner });

    expect(await project(dependencies, task('api'))).toMatchObject({
      position: { kind: 'active', step: { id: 'implement' }, attempt: { actor: owner } },
      actions: {
        finish: {
          transitions: [{ id: 'implemented', target: { kind: 'step', step: 'review' } }],
        },
        return: { targets: [{ step: 'implement', label: 'Back to implementation' }] },
      },
      task: {
        approve: no('status'),
        hold: no('active-attempt'),
        resume: no('status'),
        cancel: no('active-attempt'),
        remove: no('started'),
        editDetails: ALLOWED,
        editContext: ALLOWED,
        editDependencies: no('started'),
      },
    });
  });

  it('a Task on hold between steps is blocked; it may be resumed, not returned', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');
    await work(dependencies, task('api'), {}, owner);
    await decide(dependencies, 'api', 'on-hold');

    expect(await project(dependencies, task('api'))).toMatchObject({
      position: {
        kind: 'blocked',
        blockers: [{ kind: 'status', status: 'on-hold' }],
        next: { step: { id: 'review' } },
      },
      actions: {},
      task: { resume: ALLOWED, hold: no('status'), cancel: ALLOWED },
    });
  });

  it('terminal: the outcome; the Task can no longer change', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');
    await work(dependencies, task('api'), {}, owner);
    await work(dependencies, task('api'), { result: 'pass' }, owner);

    expect(await project(dependencies, task('api'))).toMatchObject({
      position: { kind: 'terminal', outcome: 'completed' },
      actions: {},
      task: {
        hold: no('ended'),
        cancel: no('ended'),
        editDetails: no('ended'),
        remove: no('started'),
      },
    });
  });

  it.each([
    [
      'the type is not allowed by the live policy any more',
      (dependencies: Dependencies) => {
        dependencies.references.archetypeId = 'architecture';

        return dependencies;
      },
      'type-not-allowed',
    ],
    [
      'the type is not defined any more',
      (dependencies: Dependencies) => ({
        ...dependencies,
        catalogue: { ...dependencies.catalogue, taskType: () => undefined },
      }),
      'definition-missing',
    ],
  ])('refuses a first start when %s', async (_name, change, kind) => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api', { type: 'ui-implementation' });
    await decide(dependencies, 'api', 'ready');
    const projection = await project(change(dependencies), task('api'));

    expect(projection).toMatchObject({ position: { kind: 'blocked', blockers: [{ kind }] } });
    expect(projection.position).not.toHaveProperty('preview');
    expect(projection).not.toHaveProperty('workflow');
  });

  it('reports the default context beside an explicit list (what `context: null` returns to)', async () => {
    const dependencies = memoryDependencies(catalogue);
    const own = [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'path', path: 'packages/specflow-engine/src', required: false },
    ] as const;
    await create(dependencies, 'api', { context: [...own] });

    expect((await project(dependencies, task('api'))).taskAuthoring?.context).toMatchObject({
      isDefault: false,
      entries: own.map((entry) => ({ entry })),
      defaultEntries: [
        { kind: 'task-document', id: 'task', required: true },
        { kind: 'specification-document', id: 'overview', required: true },
      ],
    });
  });

  it('refuses a start while a required context entry does not resolve', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api', {
      context: [
        { kind: 'path', path: 'packages/**/*.ts', required: false },
        { kind: 'path', path: 'packages/specflow-engine/src', required: true },
      ],
    });
    await decide(dependencies, 'api', 'ready');
    dependencies.references.paths.clear();

    expect((await project(dependencies, task('api'))).position).toMatchObject({
      kind: 'blocked',
      blockers: [
        { kind: 'context-unresolved', entries: [{ index: 1, kind: 'path', reason: 'not-found' }] },
      ],
      preview: { firstStep: 'implement' },
    });
  });

  it('a pending Task document change refuses what writes the Task folder, as the guarded store does (D03)', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');
    dependencies.references.pendingDocuments.add('api');
    // The production store (`openWorkflow`) is guarded the same way.
    const guarded = {
      ...dependencies,
      store: guardTaskDocumentChanges(dependencies.store, (specId, taskId) =>
        dependencies.references.pendingDocumentChange(specId, taskId),
      ),
    };

    expect(await project(dependencies, task('api'))).toMatchObject({
      position: { kind: 'not-started' },
      actions: { start: { step: 'implement' } },
      task: {
        hold: no('task-document-change'),
        cancel: no('task-document-change'),
        remove: no('task-document-change'),
        editDetails: no('task-document-change'),
      },
    });
    await expect(
      setTaskStatus(guarded, { specId: SPEC, taskId: 'api', status: 'on-hold', actor: owner }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_BUSY',
    });

    // A first start writes only the run record, so the guard lets it through.
    await work(guarded, task('api'), {}, owner);
    await startTaskExecution(guarded, { specId: SPEC, taskId: 'api', actor: owner });
    const review = await project(dependencies, task('api'));
    expect(review.actions.finish?.transitions).toEqual([
      expect.not.objectContaining({ unavailable: expect.anything() as unknown }),
      expect.not.objectContaining({ unavailable: expect.anything() as unknown }),
      expect.objectContaining({ id: 'escalated', unavailable: 'task-document-change' }),
    ]);
    await expect(
      finishStep(guarded, {
        subject: task('api'),
        step: 'review',
        attempt: 1,
        input: { result: 'needs-spec-change', feedback: 'The contract is wrong.' },
        actor: owner,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BUSY' });
  });

  it('a run whose pinned workflow changed offers nothing', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await decide(dependencies, 'api', 'ready');
    await work(dependencies, task('api'), {}, owner);
    const changed = {
      ...dependencies,
      catalogue: {
        ...catalogue,
        workflow: (id: string) => {
          const workflow = catalogue.workflow(id);

          return workflow && { ...workflow, title: 'Changed' };
        },
      },
    };

    expect(await project(changed, task('api'))).toMatchObject({
      position: {
        kind: 'blocked',
        blockers: [{ kind: 'definition-changed', pinned: { id: 'task-standard' } }],
      },
      actions: {},
    });
  });

  it('an unknown Task is not found', async () => {
    await expect(project(memoryDependencies(catalogue), task('nope'))).rejects.toMatchObject({
      code: 'WORKFLOW_SUBJECT_NOT_FOUND',
    });
  });
});

/** The seed catalogue with the Specification workflow edited; the edit must change it. */
async function seedCatalogueWith(edit: (workflow: string) => string): Promise<ExecutionCatalogue> {
  const files = await seedDefinitionFiles();
  const path = 'workflow/specification-standard.yaml';
  const edited = edit(files[path] ?? '');
  if (edited === files[path]) {
    throw new Error('The edit did not change the seed workflow.');
  }

  files[path] = edited;

  return resolveExecutionCatalogue(
    await loadDefinitions(new MemoryDefinitionSource(files), createDefaultDefinitionRegistry()),
  );
}

/** A Task command refused because the Specification ended, with nothing written. */
async function refusedAsEnded(dependencies: Dependencies, operation: Promise<unknown>) {
  const applied = dependencies.store.applied.length;
  await expect(operation).rejects.toMatchObject({ code: 'WORKFLOW_SPECIFICATION_ENDED' });
  expect(dependencies.store.applied).toHaveLength(applied);
}

/**
 * Once the Specification ended, the projection offers no Task creation, edit or removal, and the
 * commands refuse them. Returns the Task's projection for the status checks of each case.
 */
async function expectEndedAgreement(dependencies: Dependencies, taskId: string) {
  const level = await project(dependencies, specification);
  expect(level.specification?.createTask).toEqual(no('specification-ended'));
  await refusedAsEnded(dependencies, create(dependencies, 'late'));

  const projection = await project(dependencies, task(taskId));
  expect(projection.task).toMatchObject({
    editDetails: no('specification-ended'),
    editContext: no('specification-ended'),
    editDependencies: no('specification-ended'),
    remove: no('specification-ended'),
  });
  const revision = projection.task?.revision ?? '';
  await refusedAsEnded(
    dependencies,
    editTask(dependencies, {
      specId: SPEC,
      taskId,
      expectedRevision: revision,
      title: 'Edited',
      actor: owner,
    }),
  );
  await refusedAsEnded(
    dependencies,
    removeTask(dependencies, { specId: SPEC, taskId, expectedRevision: revision, actor: owner }),
  );

  return projection;
}

describe('the projection and the Task commands agree once the Specification ended', () => {
  it('completed: no Task is created, edited or removed; a finished Task takes no decision', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    for (const id of ['api', 'screen']) {
      await work(dependencies, task(id));
      await work(dependencies, task(id), { result: 'pass' });
    }

    await work(dependencies, specification, {}, owner);
    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });

    const projection = await expectEndedAgreement(dependencies, 'api');
    expect(projection.task).toMatchObject({ hold: no('ended'), cancel: no('ended') });
    await expect(decide(dependencies, 'api', 'on-hold')).rejects.toBeDefined();
  });

  it('abandoned: no Task is created, edited or removed; a cancelled Task takes no decision', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await abandonSpecification(dependencies, { specId: SPEC, reason: 'Superseded.', actor: owner });

    const projection = await expectEndedAgreement(dependencies, 'api');
    expect(projection.task).toMatchObject({ approve: no('status'), cancel: no('cancelled') });
    await expect(decide(dependencies, 'api', 'ready')).rejects.toBeDefined();
  });
});

/** The edit of {@link withoutWait}: the reviewed breakdown goes straight to acceptance. */
const skipWait = (text: string) =>
  text.replace(
    /(id: approved\r?\n(?: {8}.*\r?\n)*? {8}to: \{ step: )implementation/u,
    '$1acceptance',
  );

/** The seed workflow without its wait step: the reviewed breakdown goes straight to acceptance. */
const withoutWait = () => seedCatalogueWith(skipWait);

/** {@link withoutWait}, and acceptance needs a `note` of the Specification to finish. */
const withoutWaitGated = () =>
  seedCatalogueWith((text) =>
    skipWait(text).replace(
      /( {4}purpose: Confirmation that the delivered work does what the owner asked for\.)(\r?\n)/u,
      '$1$2    exitGates:$2      - type: document$2        documentType: note$2        scope: specification$2',
    ),
  );

/** The owner's acceptance attempt, active, with {@link TWO_TASKS} approved and not started. */
async function acceptingWithOpenTasks(
  catalogue: Promise<ExecutionCatalogue> = withoutWait(),
): Promise<Dependencies> {
  const dependencies = memoryDependencies(await catalogue);
  await specificationWithTasks(dependencies);
  await startSpecification(dependencies, owner);

  return dependencies;
}

const accept = (
  dependencies: Dependencies,
  input: Parameters<typeof finishStep>[1]['input'] = {},
) =>
  finishStep(dependencies, {
    subject: specification,
    step: 'acceptance',
    attempt: 1,
    input,
    actor: owner,
  });

const acceptedTransition = async (dependencies: Dependencies) =>
  (await project(dependencies, specification)).actions.finish?.transitions.find(
    (transition) => transition.id === 'accepted',
  );

/**
 * A breakdown that may also end the Specification (`nothing-to-do`, to `terminal completed`), at
 * its second attempt by the owner, after its first drafted `api` and the review sent it back.
 */
async function breakdownThatMayEnd(): Promise<Dependencies> {
  const edited = await seedCatalogueWith((text) =>
    text.replace(
      /( {6}- id: proposed)(\r?\n)((?: {8}label: .*\r?\n)? {8}to: \{ step: breakdown-review \}\r?\n {8}continuation: auto\r?\n)/u,
      '$1$2        result: proposed$2$3' +
        '      - id: nothing-to-do$2        result: empty$2        to: { terminal: completed }$2',
    ),
  );
  const dependencies = memoryDependencies(edited);
  await runToBreakdown(dependencies);
  await finishStep(dependencies, {
    subject: specification,
    step: 'breakdown',
    attempt: 1,
    input: { result: 'proposed', tasks: [TWO_TASKS[0]] },
    actor: claude,
  });
  await work(
    dependencies,
    specification,
    { result: 'fail', feedback: 'Not needed after all.' },
    agent('codex', 'session-r', 'x'),
  );
  await startSpecification(dependencies, owner);

  return dependencies;
}

const nothingToDo = async (dependencies: Dependencies) =>
  (await project(dependencies, specification)).actions.finish?.transitions.find(
    (transition) => transition.id === 'nothing-to-do',
  );

// Owner decision A (2026-11-15): a Specification completes only once no Task is open, in any
// workflow (this one has no wait step). Abandon is the way to end it with open Tasks.
describe('a Specification does not complete while its Tasks are open', () => {
  it('projects tasks-open naming each open Task, and the finish refuses it before any write', async () => {
    const dependencies = await acceptingWithOpenTasks();
    const open = [
      { taskId: 'api', cause: 'ready' },
      { taskId: 'screen', cause: 'waiting' },
    ];
    // The finish's own decisions may cancel both (a Specification step decides its Tasks).
    expect(await acceptedTransition(dependencies)).toMatchObject({
      unavailable: 'tasks-open',
      openTasks: open,
      resolvableByFinish: true,
      closableTasks: [
        { taskId: 'api', by: 'decision' },
        { taskId: 'screen', by: 'decision' },
      ],
    });

    const applied = dependencies.store.applied.length;
    await expect(accept(dependencies)).rejects.toMatchObject({
      code: 'WORKFLOW_TASKS_OPEN',
      openTasks: open,
    });
    expect(dependencies.store.applied).toHaveLength(applied);
    expect((await project(dependencies, specification)).position).toMatchObject({
      kind: 'active',
      step: { id: 'acceptance' },
    });

    // A running Task is open too.
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
    expect((await acceptedTransition(dependencies))?.openTasks).toEqual([
      { taskId: 'api', cause: 'active' },
      { taskId: 'screen', cause: 'waiting' },
    ]);
    // No decision cancels a Task during its attempt: no finish can complete now.
    const running = await acceptedTransition(dependencies);
    expect(running).toMatchObject({ unavailable: 'tasks-open' });
    expect(running).not.toHaveProperty('resolvableByFinish');
    expect(running).not.toHaveProperty('closableTasks');
  });

  it('refuses open Tasks before an unmet exit gate, in the projection and in the finish', async () => {
    const dependencies = await acceptingWithOpenTasks(withoutWaitGated());
    const transition = await acceptedTransition(dependencies);
    expect(transition).toMatchObject({
      unavailable: 'tasks-open',
      gates: [expect.objectContaining({ status: 'unsatisfied' })],
    });

    const applied = dependencies.store.applied.length;
    await expect(accept(dependencies)).rejects.toMatchObject({ code: 'WORKFLOW_TASKS_OPEN' });
    // Once the Tasks are closed, the gate is what is left.
    await expect(
      accept(dependencies, {
        taskDecisions: [
          { taskId: 'api', status: 'cancelled' },
          { taskId: 'screen', status: 'cancelled' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_GATE_UNSATISFIED' });
    expect(dependencies.store.applied).toHaveLength(applied);
  });

  it('completes once every Task is done or cancelled', async () => {
    const dependencies = await acceptingWithOpenTasks();
    await work(dependencies, task('api'));
    await work(dependencies, task('api'), { result: 'pass' });
    expect((await acceptedTransition(dependencies))?.openTasks).toEqual([
      { taskId: 'screen', cause: 'ready' },
    ]);
    await decide(dependencies, 'screen', 'cancelled');

    const transition = await acceptedTransition(dependencies);
    expect(transition).not.toHaveProperty('unavailable');
    expect(transition).not.toHaveProperty('openTasks');
    await accept(dependencies);
    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
    expect(
      closeBlockers(await readSpecificationExitState(dependencies, SPEC)).filter(
        (blocker) => blocker.kind === 'unfinished-tasks',
      ),
    ).toEqual([]);
    // A repeated finish returns the recorded result.
    await expect(accept(dependencies)).resolves.toMatchObject({ replayed: true });
  });

  it('judges the Tasks as the finish leaves them: its own decisions may cancel the open ones', async () => {
    const dependencies = await acceptingWithOpenTasks();
    await accept(dependencies, {
      taskDecisions: [
        { taskId: 'api', status: 'cancelled' },
        { taskId: 'screen', status: 'cancelled' },
      ],
    });

    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
  });

  it('a producing step whose only open Tasks are its own drafts completes by leaving them out', async () => {
    const dependencies = await breakdownThatMayEnd();
    expect(await nothingToDo(dependencies)).toMatchObject({
      unavailable: 'tasks-open',
      openTasks: [{ taskId: 'api', cause: 'draft' }],
      resolvableByFinish: true,
      closableTasks: [{ taskId: 'api', by: 'left-out' }],
    });
    const finish = (tasks: readonly (typeof TWO_TASKS)[number][]) =>
      finishStep(dependencies, {
        subject: specification,
        step: 'breakdown',
        attempt: 2,
        input: { result: 'empty', tasks },
        actor: owner,
      });
    // Keeping the draft keeps it open; leaving it out (unticking it) completes.
    await expect(finish([TWO_TASKS[0]])).rejects.toMatchObject({ code: 'WORKFLOW_TASKS_OPEN' });
    await finish([]);
    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
  });

  // Drift guard: the projection's `closableTasks` is exactly the input the real finish accepts.
  it('completes with the finish input built from closableTasks alone', async () => {
    const dependencies = await breakdownThatMayEnd();
    await create(dependencies, 'notes');
    const projected = (await project(dependencies, specification)).actions.finish;
    const transition = projected?.transitions.find((entry) => entry.id === 'nothing-to-do');
    expect(transition?.closableTasks).toEqual([
      { taskId: 'api', by: 'left-out' },
      { taskId: 'notes', by: 'decision' },
    ]);

    const closable = transition?.closableTasks ?? [];
    const leftOut = new Set(
      closable.filter((entry) => entry.by === 'left-out').map((entry) => entry.taskId),
    );
    await finishStep(dependencies, {
      subject: specification,
      step: 'breakdown',
      attempt: 2,
      input: {
        ...(transition?.result !== undefined ? { result: transition.result } : {}),
        tasks: (projected?.drafts ?? []).filter((draft) => !leftOut.has(draft.id)),
        taskDecisions: closable
          .filter((entry) => entry.by === 'decision')
          .map((entry) => ({ taskId: entry.taskId, status: 'cancelled' as const })),
      },
      actor: owner,
    });
    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
  });

  it('does not count a draft whose document change is pending as closable (D03)', async () => {
    const dependencies = await breakdownThatMayEnd();
    dependencies.references.pendingDocuments.add('api');
    const transition = await nothingToDo(dependencies);
    expect(transition).toMatchObject({
      unavailable: 'tasks-open',
      openTasks: [{ taskId: 'api', cause: 'draft' }],
      documentChangePending: ['api'],
    });
    expect(transition).not.toHaveProperty('resolvableByFinish');
    expect(transition).not.toHaveProperty('closableTasks');

    // The guarded store (as in production) refuses the finish that would cancel it.
    const guarded = {
      ...dependencies,
      store: guardTaskDocumentChanges(dependencies.store, (specId, taskId) =>
        dependencies.references.pendingDocumentChange(specId, taskId),
      ),
    };
    await expect(
      finishStep(guarded, {
        subject: specification,
        step: 'breakdown',
        attempt: 2,
        input: { result: 'empty', tasks: [] },
        actor: owner,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_BUSY' });
  });

  it('plans the transition effects after the decisions, as the finish applies them', async () => {
    // Acceptance approves the remaining drafts: a draft it would approve stays open, unless the
    // finish's own decision cancels it first (decisions come before effects).
    const dependencies = await acceptingWithOpenTasks(
      seedCatalogueWith((text) =>
        skipWait(text).replace(
          /( {6}- id: accepted\r?\n(?: {8}label: .*\r?\n)? {8}to: \{ terminal: completed \})(\r?\n)/u,
          '$1$2        effects: [approve-draft-tasks]$2',
        ),
      ),
    );
    await create(dependencies, 'notes');
    expect(await acceptedTransition(dependencies)).toMatchObject({
      unavailable: 'tasks-open',
      resolvableByFinish: true,
      closableTasks: [
        { taskId: 'api', by: 'decision' },
        { taskId: 'notes', by: 'decision' },
        { taskId: 'screen', by: 'decision' },
      ],
    });

    const cancelled = (taskIds: readonly string[]) =>
      taskIds.map((taskId) => ({ taskId, status: 'cancelled' as const }));
    await expect(
      accept(dependencies, { taskDecisions: cancelled(['api', 'screen']) }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_TASKS_OPEN',
      openTasks: [{ taskId: 'notes', cause: 'ready' }],
    });
    await accept(dependencies, { taskDecisions: cancelled(['api', 'notes', 'screen']) });
    expect((await project(dependencies, specification)).position).toEqual({
      kind: 'terminal',
      outcome: 'completed',
    });
  });

  it('abandon still ends a Specification with open Tasks', async () => {
    const dependencies = await acceptingWithOpenTasks();
    await abandonSpecification(dependencies, { specId: SPEC, reason: 'Dropped.', actor: owner });

    expect((await project(dependencies, specification)).position).toMatchObject({
      kind: 'terminal',
      outcome: 'abandoned',
    });
  });
});

// Owner decision 2026-11-16 (A-Q1): a hold is attention only when the user must act on it now.
describe('the results of the active step', () => {
  it('are read for an agent attempt the viewer cannot finish, each with the gates it needs', async () => {
    // The breakdown needs a `note` of the Specification to finish.
    const gated = await seedCatalogueWith((text) =>
      text.replace(
        /( {4}produces: tasks)(\r?\n)/u,
        '$1$2    exitGates:$2      - type: document$2        documentType: note$2        scope: specification$2',
      ),
    );
    const dependencies = memoryDependencies(gated);
    // The agent runs the breakdown: a person never finishes its attempt.
    await runToBreakdown(dependencies);

    const projection = await project(dependencies, specification);
    expect(projection.actions.finish).toBeUndefined();
    const position = projection.position;
    if (position.kind !== 'active') {
      throw new Error('Expected an active step.');
    }

    expect(position.step.id).toBe('breakdown');
    expect(position.exits.find((exit) => exit.id === 'proposed')).toMatchObject({
      target: { kind: 'step', step: 'breakdown-review' },
      gates: [expect.objectContaining({ documentType: 'note', status: 'unsatisfied' })],
    });
  });

  it('match what the finish offers, without whether a result can be taken now', async () => {
    const dependencies = await acceptingWithOpenTasks(withoutWaitGated());
    const projection = await project(dependencies, specification);
    const position = projection.position;
    if (position.kind !== 'active') {
      throw new Error('Expected an active step.');
    }

    expect(position.exits.map((exit) => exit.id)).toEqual(
      projection.actions.finish?.transitions.map((transition) => transition.id),
    );
    expect(position.exits.find((exit) => exit.id === 'accepted')).not.toHaveProperty('unavailable');
  });
});

describe('the attention of a Task on hold', () => {
  const attentionOf = async (dependencies: Dependencies, taskId: string) =>
    (await project(dependencies, task(taskId))).attention;

  it('names what the hold holds up: the waiting Tasks and the step that cannot finish', async () => {
    const dependencies = await acceptingWithOpenTasks();
    await decide(dependencies, 'api', 'on-hold');

    // `screen` waits on it, and acceptance cannot complete while it is open.
    expect(await attentionOf(dependencies, 'api')).toEqual(
      expect.objectContaining({
        subject: task('api'),
        reason: 'on-hold-blocking',
        step: 'acceptance',
        stepTitle: 'Acceptance',
        action: 'resume-task',
        secondaryAction: 'cancel-task',
        blocks: { taskIds: ['screen'], finish: 'acceptance' },
      }),
    );
    // The Task waiting on it is not attention itself (its dependency can still complete).
    expect(await attentionOf(dependencies, 'screen')).toBeUndefined();

    await decide(dependencies, 'api', 'ready');
    expect(await attentionOf(dependencies, 'api')).toBeUndefined();
  });

  it('on a wait step that can still progress: only the Tasks that wait on it', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await create(dependencies, 'notes');
    await decide(dependencies, 'notes', 'ready');
    await decide(dependencies, 'api', 'on-hold');

    expect(await attentionOf(dependencies, 'api')).toMatchObject({
      reason: 'on-hold-blocking',
      blocks: { taskIds: ['screen'] },
    });
    expect((await project(dependencies, specification)).attention).toBeUndefined();

    // A hold nothing waits on, while other work can move: nothing.
    await decide(dependencies, 'api', 'ready');
    await decide(dependencies, 'notes', 'on-hold');
    expect(await attentionOf(dependencies, 'notes')).toBeUndefined();
  });
});
