import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions, type ActionDependencies, type ActionProjection } from './actions';
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
  type Dependencies,
} from './operations.test-support';
import { guardTaskDocumentChanges } from '../state/task-document-guard';
import { finishStep } from './finish';
import { startTaskExecution } from './start';
import { createTask, type CreateTaskInput } from './task-resource';
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
      handoff: { kind: 'transition', from: { step: 'requirements' }, transition: 'agreed' },
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
        next: expect.objectContaining({ human: true, agent: { kind: 'available' } }) as unknown,
      },
      actions: {},
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
    });
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
