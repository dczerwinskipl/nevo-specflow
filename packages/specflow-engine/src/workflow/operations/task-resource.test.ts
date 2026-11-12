import { newRun } from '@nevo/workflow';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from './finish';
import { inspectExecution } from './inspect';
import {
  claude,
  memoryDependencies,
  owner,
  seedExecutionCatalogue,
  SPEC,
  specificationWithTasks,
  task,
  work,
  type Dependencies,
} from './operations.test-support';
import { startTaskExecution } from './start';
import { setTaskStatus } from './task-status';
import { createTask, editTask, removeTask, type CreateTaskInput } from './task-resource';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

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

const approve = (dependencies: Dependencies, taskId: string) =>
  setTaskStatus(dependencies, { specId: SPEC, taskId, status: 'ready', actor: owner });

const start = (dependencies: Dependencies, taskId: string, expectedWorkflowRevision?: string) =>
  startTaskExecution(dependencies, {
    specId: SPEC,
    taskId,
    actor: claude,
    ...(expectedWorkflowRevision !== undefined ? { expectedWorkflowRevision } : {}),
  });

const revisionOf = async (dependencies: Dependencies, taskId: string) =>
  (await inspectExecution(dependencies, SPEC)).tasks.find((entry) => entry.record.taskId === taskId)
    ?.revision ?? '';

/** Expect a refusal that wrote nothing. */
async function refused(dependencies: Dependencies, operation: Promise<unknown>, code: string) {
  const applied = dependencies.store.applied.length;
  await expect(operation).rejects.toMatchObject({ code });
  expect(dependencies.store.applied).toHaveLength(applied);
}

describe('a Task without a Specification run', () => {
  it('is created, edited, approved, started and finished by hand', async () => {
    const dependencies = memoryDependencies(catalogue);
    const created = await create(dependencies, 'api', {
      summary: '  The API.  ',
      context: [{ kind: 'path', path: 'packages/**/*.ts', required: true }],
    });

    expect(created.task).toMatchObject({
      taskId: 'api',
      summary: 'The API.',
      status: 'draft',
      origin: { kind: 'manual', actorId: 'owner' },
      documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    });
    expect(created.task.run).toBeUndefined();
    expect(dependencies.store.applied).toEqual([
      expect.objectContaining({
        index: { expected: null, next: { tasks: [{ id: 'api' }] } },
        documents: [{ taskId: 'api', path: 'task.md', text: '# API\n\nThe API.\n' }],
      }),
    ]);
    expect(dependencies.store.applied[0]?.runs).toBeUndefined();

    const edited = await editTask(dependencies, {
      specId: SPEC,
      taskId: 'api',
      expectedRevision: created.revision,
      title: 'API v2',
      summary: null,
      actor: owner,
    });
    expect(edited.task).toMatchObject({ title: 'API v2', type: 'implementation' });
    expect(edited.task.summary).toBeUndefined();
    expect(await approve(dependencies, 'api')).toEqual({ subject: task('api'), status: 'ready' });

    const started = await start(dependencies, 'api');
    expect(started).toMatchObject({ kind: 'started', context: { step: { id: 'implement' } } });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification).toBeUndefined();
    expect(inspection.tasks[0]?.record.run?.workflow.id).toBe('task-standard');

    await finishStep(dependencies, {
      subject: task('api'),
      step: 'implement',
      attempt: 1,
      input: {},
      actor: claude,
    });
    const reviewed = await work(dependencies, task('api'), { result: 'pass' });
    expect(reviewed.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(reviewed.specification).toBeUndefined();
  });

  it('first start pins the workflow the pin preview showed, or refuses a changed one', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await approve(dependencies, 'api');

    await refused(dependencies, start(dependencies, 'api', 'stale'), 'WORKFLOW_DEFINITION_CHANGED');
    const preview = newRun(catalogue.workflow('task-standard')!).workflow;
    await expect(start(dependencies, 'api', preview.revision)).resolves.toMatchObject({
      kind: 'started',
    });
    expect((await inspectExecution(dependencies, SPEC)).tasks[0]?.record.run?.workflow).toEqual(
      preview,
    );
    // A resume compares with the pinned revision.
    await expect(start(dependencies, 'api', preview.revision)).resolves.toMatchObject({
      kind: 'resumed',
    });
  });

  it.each([
    [
      'a type the live archetype no longer allows',
      (dependencies: Dependencies) => {
        dependencies.references.archetypeId = 'architecture';
      },
      'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
    ],
    [
      'a task type that is no longer defined',
      (dependencies: Dependencies) => {
        Object.assign(dependencies, {
          catalogue: { ...catalogue, taskType: () => undefined },
        });
      },
      'WORKFLOW_DEFINITION_MISSING',
    ],
    [
      'a task type whose workflow is no longer defined',
      (dependencies: Dependencies) => {
        Object.assign(dependencies, {
          catalogue: {
            ...catalogue,
            workflow: (id: string) => (id === 'task-ui' ? undefined : catalogue.workflow(id)),
          },
        });
      },
      'WORKFLOW_DEFINITION_MISSING',
    ],
    [
      'a required context entry that no longer resolves',
      (dependencies: Dependencies) => {
        dependencies.references.paths.delete('packages/specflow-engine/src');
      },
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
    ],
  ])('refuses the first start for %s', async (_name, change, code) => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'screen', {
      type: 'ui-implementation',
      context: [
        { kind: 'path', path: 'packages/specflow-engine/src', required: true },
        { kind: 'project-document', id: 'architecture.workflow.workflow-kernel', required: false },
      ],
    });
    await approve(dependencies, 'screen');
    // A missing optional entry never blocks a start.
    dependencies.references.projectDocuments.clear();
    change(dependencies);

    await refused(dependencies, start(dependencies, 'screen'), code);
  });

  it('takes the policy from the Specification run once it started, not the live archetype', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    dependencies.references.archetypeId = 'architecture';

    await expect(create(dependencies, 'web', { type: 'ui-implementation' })).resolves.toMatchObject(
      { task: { type: 'ui-implementation' } },
    );
  });
});

describe('after the first start', () => {
  it('refuses a dependency change', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'base');
    await create(dependencies, 'api');
    await approve(dependencies, 'api');
    await start(dependencies, 'api');

    await refused(
      dependencies,
      editTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        expectedRevision: await revisionOf(dependencies, 'api'),
        dependsOn: ['base'],
        actor: owner,
      }),
      'WORKFLOW_INPUT_INVALID',
    );
  });

  it('blocks the next step start on a required context entry that went stale', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api', {
      context: [{ kind: 'specification-document', id: 'requirements', required: true }],
    });
    await approve(dependencies, 'api');
    await work(dependencies, task('api'));
    dependencies.references.specificationDocuments.delete('requirements');

    await refused(dependencies, start(dependencies, 'api'), 'WORKFLOW_TASK_CONTEXT_UNRESOLVED');
  });

  it('keeps an unchanged context entry written in another key order', async () => {
    const dependencies = memoryDependencies(catalogue);
    const created = await create(dependencies, 'api', {
      context: [{ kind: 'path', path: 'packages/specflow-engine/src', required: false }],
    });
    dependencies.references.paths.clear();

    await expect(
      editTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        expectedRevision: created.revision,
        context: [{ required: false, path: 'packages/specflow-engine/src', kind: 'path' }],
        actor: owner,
      }),
    ).resolves.toMatchObject({ task: { taskId: 'api' } });
  });
});

describe('creating and editing Tasks', () => {
  it.each<[string, Partial<CreateTaskInput>, string]>([
    ['an invalid id', { taskId: 'Not Valid' }, 'WORKFLOW_INPUT_INVALID'],
    ['an existing id', { taskId: 'api' }, 'WORKFLOW_TASK_EXISTS'],
    ['an empty title', { title: '  ' }, 'WORKFLOW_INPUT_INVALID'],
    ['an undefined type', { type: 'research' }, 'WORKFLOW_DEFINITION_MISSING'],
    ['an unknown dependency', { dependsOn: ['ghost'] }, 'WORKFLOW_INPUT_INVALID'],
    [
      'a Specification document that is not registered',
      { context: [{ kind: 'specification-document', id: 'ux', required: false }] },
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
    ],
    [
      'a path that matches nothing',
      { context: [{ kind: 'path', path: 'src/missing.ts', required: true }] },
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
    ],
    [
      'a Task document that the Task does not register',
      { context: [{ kind: 'task-document', id: 'notes', required: true }] },
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
    ],
    [
      'a path outside the repository',
      { context: [{ kind: 'path', path: '../secrets', required: true }] },
      'WORKFLOW_INPUT_INVALID',
    ],
  ])('refuses %s', async (_name, overrides, code) => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');

    await refused(dependencies, create(dependencies, overrides.taskId ?? 'web', overrides), code);
  });

  it('names each context entry that does not resolve, by position, key and reason', async () => {
    const dependencies = memoryDependencies(catalogue);

    await expect(
      create(dependencies, 'web', {
        context: [
          { kind: 'instructions', text: 'Keep it small.', required: true },
          { kind: 'specification-document', id: 'ux', required: false },
          { kind: 'task-document', id: 'notes', required: true },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
      unresolved: [
        { index: 1, key: 'specification-document:ux', reason: 'not-found' },
        { index: 2, key: 'task-document:notes', reason: 'not-registered' },
      ],
    });
  });

  it('refuses a type the live archetype does not allow', async () => {
    const dependencies = memoryDependencies(catalogue);
    dependencies.references.archetypeId = 'architecture';

    await refused(
      dependencies,
      create(dependencies, 'screen', { type: 'ui-implementation' }),
      'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
    );
  });

  it('refuses a type change, a stale revision and a dependency cycle', async () => {
    const dependencies = memoryDependencies(catalogue);
    const api = await create(dependencies, 'api');
    await create(dependencies, 'web', { dependsOn: ['api'] });
    const edit = (overrides: Partial<Parameters<typeof editTask>[1]>) =>
      editTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        expectedRevision: api.revision,
        actor: owner,
        ...overrides,
      });

    await refused(
      dependencies,
      edit({ type: 'ui-implementation' }),
      'WORKFLOW_TASK_TYPE_IMMUTABLE',
    );
    await refused(dependencies, edit({ dependsOn: ['web'] }), 'WORKFLOW_INPUT_INVALID');
    await edit({ title: 'API v2' });
    await refused(dependencies, edit({ title: 'API v3' }), 'WORKFLOW_TASK_REVISION_CONFLICT');
  });

  it('keeps a context entry that went stale, but checks the ones an edit adds', async () => {
    const dependencies = memoryDependencies(catalogue);
    const created = await create(dependencies, 'api', {
      context: [{ kind: 'specification-document', id: 'requirements', required: false }],
    });
    dependencies.references.specificationDocuments.delete('requirements');
    const edited = await editTask(dependencies, {
      specId: SPEC,
      taskId: 'api',
      expectedRevision: created.revision,
      title: 'Renamed',
      actor: owner,
    });

    await refused(
      dependencies,
      editTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        expectedRevision: edited.revision,
        context: [
          ...(edited.task.context ?? []),
          { kind: 'project-document', id: 'unknown.doc', required: false },
        ],
        actor: owner,
      }),
      'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
    );
  });

  it('only lets the owner create a Task', async () => {
    const dependencies = memoryDependencies(catalogue);

    await refused(
      dependencies,
      create(dependencies, 'api', { actor: claude as never }),
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    );
  });
});

describe('removing a Task', () => {
  const remove = async (dependencies: Dependencies, taskId: string) =>
    removeTask(dependencies, {
      specId: SPEC,
      taskId,
      expectedRevision: await revisionOf(dependencies, taskId),
      actor: owner,
    });

  it('removes a Task that never started with its documents, in one change', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await create(dependencies, 'web');

    await remove(dependencies, 'api');

    expect(dependencies.store.applied.at(-1)).toEqual({
      index: expect.objectContaining({ next: { tasks: [{ id: 'web' }] } }) as unknown,
      manifests: [expect.objectContaining({ taskId: 'api', next: null }) as unknown],
      documents: [{ taskId: 'api', path: 'task.md', text: null }],
    });
    const snapshot = await dependencies.store.read(SPEC);
    expect(snapshot.folders).toEqual(['web']);
    expect(snapshot.issues).toEqual([]);
  });

  it.each([
    [
      'a started Task',
      async (dependencies: Dependencies) => {
        await approve(dependencies, 'api');
        await start(dependencies, 'api');
      },
      'it has started',
    ],
    [
      'a Task another Task depends on',
      async (dependencies: Dependencies) => {
        await create(dependencies, 'web', { dependsOn: ['api'] });
      },
      'the Tasks web depend on it',
    ],
    [
      'a Task whose folder holds a file it does not register',
      async (dependencies: Dependencies) => {
        await dependencies.store.apply(SPEC, {
          documents: [{ taskId: 'api', path: 'notes.txt', text: 'mine' }],
        });
      },
      'notes.txt',
    ],
    [
      'a Task with a pending document change',
      (dependencies: Dependencies) => {
        dependencies.references.pendingDocuments.add('api');

        return Promise.resolve();
      },
      'is pending',
    ],
  ])('refuses %s', async (_name, prepare, message) => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await prepare(dependencies);
    const applied = dependencies.store.applied.length;

    await expect(remove(dependencies, 'api')).rejects.toMatchObject({
      code: 'WORKFLOW_TASK_NOT_REMOVABLE',
      message: expect.stringContaining(message) as unknown,
    });
    expect(dependencies.store.applied).toHaveLength(applied);
  });
});

describe('a broken Task', () => {
  it('is refused alone: the other Tasks are created, edited and started', async () => {
    const dependencies = memoryDependencies(catalogue);
    await create(dependencies, 'api');
    await create(dependencies, 'web');
    await approve(dependencies, 'api');
    await approve(dependencies, 'web');
    await start(dependencies, 'api');
    // A run whose position does not follow from its history (a hand edit).
    const [record] = (await dependencies.store.read(SPEC)).runs;
    await dependencies.store.apply(SPEC, {
      runs: [
        {
          taskId: 'api',
          expected: record?.revision ?? null,
          next: {
            ...record!.value,
            run: {
              ...record!.value.run,
              position: { state: 'ready', step: 'review' },
              attempts: [],
            },
          },
        },
      ],
    });

    expect((await inspectExecution(dependencies, SPEC)).brokenTasks).toEqual(['api']);
    await refused(dependencies, start(dependencies, 'api'), 'WORKFLOW_STATE_CORRUPT');
    await refused(
      dependencies,
      create(dependencies, 'docs', { dependsOn: ['api'] }),
      'WORKFLOW_INPUT_INVALID',
    );
    await expect(start(dependencies, 'web')).resolves.toMatchObject({ kind: 'started' });
    await expect(create(dependencies, 'docs')).resolves.toMatchObject({ task: { taskId: 'docs' } });
  });
});

describe('a status change', () => {
  it('settles the wait of a Specification run, and needs none', async () => {
    const dependencies = memoryDependencies(catalogue);
    await specificationWithTasks(dependencies);
    await setTaskStatus(dependencies, {
      specId: SPEC,
      taskId: 'screen',
      status: 'cancelled',
      actor: owner,
    });

    const settled = await setTaskStatus(dependencies, {
      specId: SPEC,
      taskId: 'api',
      status: 'cancelled',
      actor: owner,
    });

    expect(settled.specification).toMatchObject({ step: 'acceptance' });
    expect((await inspectExecution(dependencies, SPEC)).specification?.record.run.position).toEqual(
      { state: 'ready', step: 'acceptance' },
    );
  });
});
