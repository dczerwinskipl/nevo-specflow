import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { newRun } from '@nevo/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { symlinksAvailable } from '../../../test/support/platform';

import { sha256Hex } from '../../hash';
import { finishStep, type FinishStepInput } from '../operations/finish';
import { readExecution } from '../operations/execution-read';
import { inspectExecution } from '../operations/inspect';
import type { WorkflowDependencies } from '../operations/loaded-execution';
import {
  agent,
  claude,
  memoryDependencies,
  owner,
  runToBreakdown,
  seedExecutionCatalogue,
  specification as operationSpecification,
  specificationWithTasks,
  startSpecification,
  task as operationTask,
  TWO_TASKS,
  work,
} from '../operations/operations.test-support';
import { startSpecificationExecution, startTaskExecution } from '../operations/start';
import { returnToStep } from '../operations/return';
import { setTaskStatus } from '../operations/task-status';
import { createTask } from '../operations/task-resource';

import { TASKS_PER_SPECIFICATION_MAX } from '../limits';
import { serializeTaskIndex, serializeTaskManifest } from '../../tasks/resource/codec';
import type { TaskManifest } from '../../tasks/resource/model';
import {
  parseSpecificationRecord,
  parseTaskRunRecord,
  serializeSpecificationRecord,
  serializeTaskRunRecord,
} from './codec';
import {
  createFilesystemWorkflowStore,
  createFilesystemWorkflowStoreForTest,
  EXECUTION_DIRECTORY,
} from './filesystem-store';
import type { JournalWrite } from './journal';
import type { TaskRunRecord, WorkflowRun } from './model';
import type { ExecutionChange, ExecutionFileWrite, ExecutionStateCommits } from './store';
import {
  creating,
  EMPTY,
  manifest,
  OTHER_SPEC,
  record,
  runRecord,
  SPEC,
} from './store-contract.test-support';
import { stateOfSnapshot } from './validate';

let root: string;
let stateRoot: string;
let specificationDirectory: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'workflow-store-')));
  stateRoot = join(root, 'state');
  specificationDirectory = join(root, 'checkout', 'specs', 'one');
  await mkdir(stateRoot, { recursive: true });
  await mkdir(specificationDirectory, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const options = () => ({
  stateRoot,
  specificationDirectory: () => Promise.resolve(specificationDirectory),
});
const store = () => createFilesystemWorkflowStore(options());
const storeWithPublishHook = (beforePublishTarget: (write: JournalWrite) => Promise<void>) =>
  createFilesystemWorkflowStoreForTest(options(), beforePublishTarget);

const executionDirectory = () => join(specificationDirectory, EXECUTION_DIRECTORY);
const specificationPath = () => join(executionDirectory(), 'specification.yaml');
/** The Task run records. */
const tasksDirectory = () => join(executionDirectory(), 'tasks');
/** The Task resources: `tasks/index.yaml` and one folder per Task. */
const resourceDirectory = () => join(specificationDirectory, 'tasks');
const journalPath = () => join(stateRoot, 'engine', 'operations', 'workflow', `${SPEC}.json`);

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function writeJournal(writes: readonly unknown[]): Promise<void> {
  await mkdir(join(stateRoot, 'engine', 'operations', 'workflow'), { recursive: true });
  await writeFile(journalPath(), JSON.stringify({ version: 3, specId: SPEC, writes }));
}

async function seedSpecification(step = 'requirements') {
  const target = store();
  await target.apply(SPEC, {
    specification: { expected: null, next: record(step) },
  });

  return target;
}

describe('filesystem workflow store', () => {
  it('runs the operations end to end and keeps the canonical state next to the Specification', async () => {
    const dependencies = { ...memoryDependencies(await seedExecutionCatalogue()), store: store() };
    const executor = agent('antigravity', 's');
    await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
      actor: executor,
    });
    await finishStep(dependencies, {
      subject: { kind: 'specification', specId: SPEC },
      step: 'requirements',
      attempt: 1,
      input: { feedback: 'Scope agreed.' },
      actor: executor,
    });

    const text = await readFile(specificationPath(), 'utf8');
    expect(text).toContain('feedback: Scope agreed.');
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification?.record.run.position).toEqual({
      state: 'ready',
      step: 'specification',
    });
    expect(inspection.attention).toMatchObject([
      { reason: 'model-missing', provider: 'antigravity' },
    ]);
  });

  it('refuses a write planned against an older revision', async () => {
    const target = await seedSpecification();

    await expect(
      target.apply(SPEC, {
        specification: { expected: null, next: record('specification') },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
  });

  it('exposes a change interrupted after its journal whole, and finishes it on the next write', async () => {
    const target = await seedSpecification();
    await writeJournal([
      {
        target: 'specification',
        text: serializeSpecificationRecord(record('solution')),
        expected: sha256Hex(await readFile(specificationPath(), 'utf8')),
      },
    ]);

    const read = await target.read(SPEC);
    expect(read.specification?.value.run.position).toEqual({ state: 'ready', step: 'solution' });
    await target.apply(SPEC, {
      specification: { expected: read.specification?.revision ?? null, next: record('breakdown') },
    });
    expect((await target.read(SPEC)).specification?.value.run.position).toEqual({
      state: 'ready',
      step: 'breakdown',
    });
    await expect(readFile(journalPath(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('replays a journal whose targets were partly written before the crash', async () => {
    const target = await seedSpecification();
    const previous = sha256Hex(await readFile(specificationPath(), 'utf8'));
    const next = serializeSpecificationRecord(record('solution'));
    await writeFile(specificationPath(), next);
    await writeJournal([
      { target: 'specification', text: next, expected: previous },
      {
        target: 'task-index',
        text: serializeTaskIndex({ tasks: [{ id: 'api' }] }),
        expected: null,
      },
      {
        target: 'task-manifest',
        taskId: 'api',
        text: serializeTaskManifest(manifest('api')),
        expected: null,
      },
      { target: 'task-document', taskId: 'api', path: 'task.md', text: '# api\n', expected: null },
      {
        target: 'task-run',
        taskId: 'api',
        text: serializeTaskRunRecord(runRecord('api')),
        expected: null,
      },
    ]);

    const read = await target.read(SPEC);
    expect(read.specification?.value.run.position).toEqual({ state: 'ready', step: 'solution' });
    expect(read.manifests.map((entry) => entry.value.id)).toEqual(['api']);
    expect(read.runs.map((entry) => entry.value.taskId)).toEqual(['api']);
    expect(read.folders).toEqual(['api']);
    expect(read.issues).toEqual([]);
    await target.apply(SPEC, {});
    expect(await readFile(join(resourceDirectory(), 'api', 'task.md'), 'utf8')).toBe('# api\n');
  });

  it('refuses to replay a journal over state that changed outside the Engine', async () => {
    const target = await seedSpecification();
    await writeJournal([
      {
        target: 'specification',
        text: serializeSpecificationRecord(record('solution')),
        expected: sha256Hex(await readFile(specificationPath(), 'utf8')),
      },
    ]);
    // A branch switch brings another state of the Specification.
    const switched = serializeSpecificationRecord(record('breakdown'));
    await writeFile(specificationPath(), switched);

    await expect(target.read(SPEC)).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
    await expect(
      target.apply(SPEC, {
        specification: { expected: sha256Hex(switched), next: record('solution') },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
    expect(await readFile(specificationPath(), 'utf8')).toBe(switched);
  });

  it('names the journal the owner deletes by hand to keep the changed state', async () => {
    const target = await seedSpecification();
    await writeJournal([
      {
        target: 'specification',
        text: serializeSpecificationRecord(record('solution')),
        expected: sha256Hex(await readFile(specificationPath(), 'utf8')),
      },
    ]);
    await writeFile(specificationPath(), serializeSpecificationRecord(record('breakdown')));

    await expect(target.read(SPEC)).rejects.toMatchObject({
      code: 'WORKFLOW_STATE_CONFLICT',
      message: expect.stringContaining(journalPath()) as unknown,
    });
    await rm(journalPath());
    expect((await target.read(SPEC)).specification?.value.run.position).toEqual({
      state: 'ready',
      step: 'breakdown',
    });
  });

  it('ignores names among the Tasks that are not Task records', async () => {
    const target = store();
    await target.apply(SPEC, creating([manifest('api')]));
    for (const name of [
      '.gitkeep',
      'Thumbs.db',
      'desktop.ini',
      '.api.yaml.swp',
      'api.yaml.orig',
      'api.yaml~',
      'notes.txt',
      '.hidden.yaml',
    ]) {
      await writeFile(join(tasksDirectory(), name), 'not a record');
      await writeFile(join(resourceDirectory(), name), 'not a Task');
    }

    // Folders below `tasks/` that cannot be Tasks are not Tasks either.
    for (const name of ['.git', 'Not_A_Task', 'con']) {
      await mkdir(join(resourceDirectory(), name));
    }

    const read = await target.read(SPEC);
    expect(read.runs.map((entry) => entry.value.taskId)).toEqual(['api']);
    expect(read.folders).toEqual(['api']);
    expect(read.issues).toEqual([]);

    await writeFile(join(tasksDirectory(), 'Not_A_Task.yaml'), 'not a record');
    await expect(target.read(SPEC)).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });
  });

  it('ignores stage files of an interrupted write and removes them on the next change', async () => {
    const target = store();
    await target.apply(SPEC, {
      specification: { expected: null, next: record('requirements') },
      ...creating([manifest('api')]),
    });
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    await writeFile(join(tasksDirectory(), `.api.yaml.${uuid}.tmp`), 'version: 1\npartial');
    await writeFile(join(executionDirectory(), `.specification.yaml.${uuid}.tmp`), 'partial');
    await writeFile(join(resourceDirectory(), `.index.yaml.${uuid}.tmp`), 'partial');
    await writeFile(join(resourceDirectory(), 'api', `.task.yaml.${uuid}.tmp`), 'partial');

    const read = await target.read(SPEC);
    expect(read.manifests.map((entry) => entry.value.id)).toEqual(['api']);
    await target.apply(SPEC, {
      manifests: [
        {
          taskId: 'api',
          expected: read.manifests[0]?.revision ?? null,
          next: manifest('api', 'API'),
        },
      ],
    });
    expect(await readdir(tasksDirectory())).toEqual(['api.yaml']);
    expect((await readdir(resourceDirectory())).sort()).toEqual(['api', 'index.yaml']);
    expect((await readdir(join(resourceDirectory(), 'api'))).sort()).toEqual([
      'task.md',
      'task.yaml',
    ]);
    expect((await readdir(executionDirectory())).sort()).toEqual(['specification.yaml', 'tasks']);
  });

  it.each<[string, () => ExecutionChange]>([
    [
      'a Task title over the limit',
      () => ({
        specification: { expected: null, next: record('requirements') },
        ...creating([manifest('api', 'x'.repeat(201))]),
      }),
    ],
    [
      'an empty artifact next to a valid Task',
      () => ({
        specification: {
          expected: null,
          next: {
            ...record('solution'),
            run: {
              ...record('solution').run,
              attempts: [
                {
                  step: 'requirements',
                  attempt: 1,
                  sequence: 1,
                  startedAt: '2026-11-05T10:00:00.000Z',
                  endedAt: '2026-11-05T10:00:01.000Z',
                  outcome: { kind: 'transition', transition: 'agreed', artifacts: [''] },
                },
              ],
            },
          },
        },
        ...creating([manifest('api')]),
      }),
    ],
  ])('writes nothing for %s, and later reads still work', async (_name, change) => {
    const target = store();

    await expect(target.apply(SPEC, change())).rejects.toMatchObject({
      code: 'WORKFLOW_STATE_CORRUPT',
    });
    await expect(readdir(executionDirectory())).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(resourceDirectory())).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(journalPath(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await target.read(SPEC)).toEqual(EMPTY);
  });

  it('fails closed on a hand-edited record', async () => {
    await mkdir(executionDirectory(), { recursive: true });
    await writeFile(specificationPath(), 'version: 1\nspecId: spec-1\nrun: {}\n');

    await expect(store().read(SPEC)).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });
  });
});

const corrupt = { code: 'WORKFLOW_STATE_CORRUPT' };
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

async function writeTaskFile(name: string, text: string): Promise<void> {
  await mkdir(tasksDirectory(), { recursive: true });
  await writeFile(join(tasksDirectory(), name), text);
}

/** A directory link that needs no privilege on Windows (a junction) and is a symlink elsewhere. */
async function linkDirectory(target: string, link: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await mkdir(dirname(link), { recursive: true });
  await symlink(target, link, 'junction');
}

describe('filesystem workflow store: commits of its writes', () => {
  it('admits a change with its paths before writing, then records what it published', async () => {
    const calls: unknown[] = [];
    const committing = (refuse: boolean) =>
      createFilesystemWorkflowStore({
        ...options(),
        commits: {
          admit: async (specId, paths) => {
            calls.push({ specId, admit: [...paths], journal: await exists(journalPath()) });
            if (refuse) {
              throw new Error('refused by the commit policy');
            }

            return {
              record: (summary, writes) => {
                calls.push({ summary, writes });

                return Promise.resolve();
              },
            };
          },
        },
      });

    await expect(
      committing(true).apply(SPEC, {
        summary: 'start step requirements (attempt 1)',
        specification: { expected: null, next: record('requirements') },
      }),
    ).rejects.toThrow('refused by the commit policy');
    // A refused change writes nothing.
    expect(await exists(specificationPath())).toBe(false);
    expect(await exists(journalPath())).toBe(false);

    calls.length = 0;
    await committing(false).apply(SPEC, {
      summary: 'create task api',
      ...creating([manifest('api')], { runs: false }),
    });
    const text = await readFile(join(resourceDirectory(), 'api', 'task.yaml'), 'utf8');
    expect(calls).toEqual([
      {
        specId: SPEC,
        admit: ['tasks/index.yaml', 'tasks/api/task.yaml', 'tasks/api/task.md'],
        journal: false,
      },
      {
        summary: 'create task api',
        writes: expect.arrayContaining([
          {
            path: 'tasks/api/task.yaml',
            pre: null,
            post: { sha256: sha256Hex(text), bytes: Buffer.byteLength(text, 'utf8') },
          },
        ]) as unknown,
      },
    ]);
    expect((calls[1] as { writes: unknown[] }).writes).toHaveLength(3);
  });
});

describe('filesystem workflow store: a change interrupted around its commit record', () => {
  it.each(['beforeRecord', 'afterRecord'] as const)(
    'records it exactly once with its original pre after a stop %s',
    async (point) => {
      // A commit policy that, like the document journal store, records an operation id once.
      const recorded = new Map<
        string,
        { summary: string; writes: readonly ExecutionFileWrite[] }
      >();
      let records = 0;
      const commits: ExecutionStateCommits = {
        admit: (_specId, _paths, operationId) =>
          Promise.resolve({
            record: (summary, writes) => {
              records += 1;
              if (!recorded.has(operationId)) {
                recorded.set(operationId, { summary, writes });
              }

              return Promise.resolve();
            },
          }),
      };
      const plain = createFilesystemWorkflowStore({ ...options(), commits });
      await plain.apply(SPEC, { specification: { expected: null, next: record('requirements') } });
      const before = await readFile(specificationPath(), 'utf8');
      recorded.clear();
      records = 0;

      const cut = createFilesystemWorkflowStoreForTest(
        { ...options(), commits },
        () => Promise.resolve(),
        { [point]: () => Promise.reject(new Error('stopped')) },
      );
      await expect(
        cut.apply(SPEC, {
          summary: 'finish step requirements (attempt 1)',
          specification: { expected: sha256Hex(before), next: record('specification') },
        }),
      ).rejects.toThrow('stopped');
      // The files are published and the journal survives the stop.
      const after = await readFile(specificationPath(), 'utf8');
      expect(after).not.toBe(before);
      expect(await exists(journalPath())).toBe(true);

      // The next change finishes it: recorded under the same id, with the content it replaced.
      await plain.apply(SPEC, {});
      expect(await exists(journalPath())).toBe(false);
      expect([...recorded.values()]).toEqual([
        {
          summary: 'finish step requirements (attempt 1)',
          writes: [
            {
              path: '.execution/specification.yaml',
              pre: { sha256: sha256Hex(before), bytes: Buffer.byteLength(before, 'utf8') },
              post: { sha256: sha256Hex(after), bytes: Buffer.byteLength(after, 'utf8') },
            },
          ],
        },
      ]);
      expect(records).toBe(point === 'beforeRecord' ? 1 : 2);
    },
  );
});

describe('filesystem workflow store: identity of the stored records', () => {
  it('refuses a Task record whose id is not its file name', async () => {
    await writeTaskFile('api.yaml', serializeTaskRunRecord(runRecord('web')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a Task record of another Specification', async () => {
    await writeTaskFile('api.yaml', serializeTaskRunRecord(runRecord('api', OTHER_SPEC)));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a Specification record of another Specification', async () => {
    await mkdir(executionDirectory(), { recursive: true });
    await writeFile(
      specificationPath(),
      serializeSpecificationRecord(record('requirements', OTHER_SPEC)),
    );

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a journal that writes one Task twice', async () => {
    await writeJournal([
      {
        target: 'task-manifest',
        taskId: 'api',
        text: serializeTaskManifest(manifest('api')),
        expected: null,
      },
      {
        target: 'task-manifest',
        taskId: 'api',
        text: serializeTaskManifest(manifest('api', 'B')),
        expected: null,
      },
    ]);

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a Task manifest whose id is not its folder name', async () => {
    await mkdir(join(resourceDirectory(), 'api'), { recursive: true });
    await writeFile(
      join(resourceDirectory(), 'index.yaml'),
      serializeTaskIndex({ tasks: [{ id: 'api' }] }),
    );
    await writeFile(
      join(resourceDirectory(), 'api', 'task.yaml'),
      serializeTaskManifest(manifest('web')),
    );

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses stored records that are incoherent although each one parses', async () => {
    await mkdir(executionDirectory(), { recursive: true });
    await writeFile(
      specificationPath(),
      serializeSpecificationRecord({
        ...record('requirements'),
        run: {
          ...record('requirements').run,
          position: { state: 'active', step: 'requirements', attempt: 1 },
        },
      }),
    );

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });
});

describe('filesystem workflow store: symlinks', () => {
  const outside = () => join(root, 'outside');

  it('refuses an execution folder that is a link', async () => {
    await linkDirectory(outside(), executionDirectory());
    await writeFile(
      join(outside(), 'specification.yaml'),
      serializeSpecificationRecord(record('x')),
    );

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(store().apply(SPEC, creating([manifest('api')]))).rejects.toMatchObject(corrupt);
    expect(await readdir(outside())).toEqual(['specification.yaml']);
  });

  it('refuses a Task run folder that is a link', async () => {
    await mkdir(executionDirectory(), { recursive: true });
    await linkDirectory(outside(), tasksDirectory());
    await writeFile(join(outside(), 'api.yaml'), serializeTaskRunRecord(runRecord('api')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(store().apply(SPEC, creating([manifest('web')]))).rejects.toMatchObject(corrupt);
    expect(await readdir(outside())).toEqual(['api.yaml']);
  });

  it('refuses a Task resource folder that is a link', async () => {
    await linkDirectory(outside(), resourceDirectory());
    await writeFile(join(outside(), 'index.yaml'), serializeTaskIndex({ tasks: [] }));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(
      store().apply(SPEC, creating([manifest('web')], { runs: false })),
    ).rejects.toMatchObject(corrupt);
    expect(await readdir(outside())).toEqual(['index.yaml']);
  });

  it('refuses a Task folder that is a link', async () => {
    await store().apply(SPEC, creating([manifest('api')], { runs: false }));
    await rm(join(resourceDirectory(), 'api'), { recursive: true });
    await linkDirectory(outside(), join(resourceDirectory(), 'api'));
    await writeFile(join(outside(), 'task.yaml'), serializeTaskManifest(manifest('api')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a journal folder that is a link', async () => {
    await seedSpecification();
    const journalDirectory = join(stateRoot, 'engine', 'operations', 'workflow');
    await rm(journalDirectory, { recursive: true, force: true });
    await linkDirectory(join(root, 'outside-journal'), journalDirectory);

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it.skipIf(!symlinksAvailable)('refuses a record file that is a link', async () => {
    await mkdir(outside(), { recursive: true });
    await writeFile(join(outside(), 'api.yaml'), serializeTaskRunRecord(runRecord('api')));
    await mkdir(tasksDirectory(), { recursive: true });
    await symlink(join(outside(), 'api.yaml'), join(tasksDirectory(), 'api.yaml'), 'file');

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(store().apply(SPEC, creating([manifest('web')]))).rejects.toMatchObject(corrupt);
  });
});

describe('filesystem workflow store: publication re-checks each target', () => {
  it('refuses to overwrite a target that changed after the change was planned', async () => {
    const seeded = await seedSpecification();
    const before = await seeded.read(SPEC);
    const external = serializeTaskRunRecord({
      ...runRecord('api'),
      run: { ...runRecord('api').run, workflow: { ...runRecord('api').run.workflow, version: 2 } },
    });
    const target = storeWithPublishHook(async (write) => {
      if (write.target === 'task-run') {
        await writeTaskFile('api.yaml', external);
      }
    });

    await expect(
      target.apply(SPEC, {
        specification: {
          expected: before.specification?.revision ?? null,
          next: record('solution'),
        },
        ...creating([manifest('api')]),
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
    expect(await readFile(join(tasksDirectory(), 'api.yaml'), 'utf8')).toBe(external);
    // The journal stays pending: deleting it by hand keeps the partly applied change.
    expect(JSON.parse(await readFile(journalPath(), 'utf8'))).toMatchObject({ specId: SPEC });
  });
});

describe('filesystem workflow store: attention over a pending journal', () => {
  it('derives the attention of the change a crashed publication left in the journal', async () => {
    const base = memoryDependencies(await seedExecutionCatalogue());
    let armed = false;
    const crashing = {
      ...base,
      store: storeWithPublishHook(() =>
        armed ? Promise.reject(new Error('Crash before publishing.')) : Promise.resolve(),
      ),
    };
    await specificationWithTasks(crashing);
    armed = true;
    await expect(
      setTaskStatus(crashing, { specId: SPEC, taskId: 'api', status: 'on-hold', actor: owner }),
    ).rejects.toThrow('Crash');
    expect(await readFile(journalPath(), 'utf8')).toContain(SPEC);

    // A read overlays the pending journal: the hold is there, and with it the stuck wait.
    const reading = await readExecution({ ...base, store: store() }, SPEC, { tasks: 'all' });
    expect(reading.facts.get('api')).toMatchObject({ preparation: 'on-hold' });
    expect(reading.inspection.attention).toEqual([
      expect.objectContaining({
        reason: 'tasks-stuck',
        blocking: [{ taskId: 'api', cause: 'on-hold' }],
      }),
    ]);
  });
});

describe('filesystem workflow store: a finish retried after a crash (F16)', () => {
  it('returns the recorded result when the publication of the finish crashed midway', async () => {
    const base = memoryDependencies(await seedExecutionCatalogue());
    let armed = false;
    let published = 0;
    const crashing = {
      ...base,
      store: storeWithPublishHook(() => {
        if (armed && (published += 1) === 2) {
          return Promise.reject(new Error('Crash after the first published target.'));
        }

        return Promise.resolve();
      }),
    };
    await runToBreakdown(crashing);
    const breakdown = {
      subject: operationSpecification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    } as const;
    armed = true;
    await expect(finishStep(crashing, breakdown)).rejects.toThrow('Crash');
    // Half the change is on disk: the journal is pending, the Specification record is published
    // and the Task files are not.
    const taskFolders = async () => (await readdir(resourceDirectory()).catch(() => [])).sort();
    expect(await readFile(journalPath(), 'utf8')).toContain(SPEC);
    expect(await taskFolders()).toEqual([]);
    expect(await readFile(specificationPath(), 'utf8')).toContain('state: ready');

    // A read sees the whole change, so the retry is the same finish; it publishes the journal.
    const dependencies = { ...base, store: store() };
    await expect(finishStep(dependencies, breakdown)).resolves.toMatchObject({
      replayed: true,
      transition: 'proposed',
      position: { state: 'ready', step: 'breakdown-review' },
      createdTasks: ['api', 'screen'],
    });
    await expect(readFile(journalPath(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    // Drafts have no run record: their first start creates it.
    await expect(readdir(tasksDirectory())).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await taskFolders()).toEqual(['api', 'index.yaml', 'screen']);
    expect(await readFile(specificationPath(), 'utf8')).toContain('state: ready');
    await expect(
      finishStep(dependencies, { ...breakdown, input: { tasks: [TWO_TASKS[0]] } }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });
});

describe('filesystem workflow store: the previous record format', () => {
  it.each<[string, (text: string) => string]>([
    ['the previous version', (text) => text.replace(/^version: 3$/mu, 'version: 2')],
    [
      'an attempt with the previous executor field',
      (text) => text.replace(/^(\s+)actor:$/mu, '$1executor:'),
    ],
  ])('is corrupt state: %s', async (_name, edit) => {
    const dependencies = { ...memoryDependencies(await seedExecutionCatalogue()), store: store() };
    await startSpecification(dependencies);
    await writeFile(specificationPath(), edit(await readFile(specificationPath(), 'utf8')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });
});
describe('filesystem workflow store: read budgets', () => {
  it('refuses more Task records than a Specification may have', async () => {
    for (let index = 0; index <= TASKS_PER_SPECIFICATION_MAX; index += 1) {
      const taskId = `t-${String(index)}`;
      await writeTaskFile(`${taskId}.yaml`, serializeTaskRunRecord(runRecord(taskId)));
    }

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  }, 60_000);

  const padding = `# ${'x'.repeat(300 * 1024)}\n`;

  it.each<[string, () => Promise<void>]>([
    [
      'Specification record',
      async () => {
        await mkdir(executionDirectory(), { recursive: true });
        await writeFile(specificationPath(), padding + serializeSpecificationRecord(record('x')));
      },
    ],
    [
      'Task run record',
      () => writeTaskFile('api.yaml', padding + serializeTaskRunRecord(runRecord('api'))),
    ],
    [
      'Task index',
      async () => {
        await mkdir(resourceDirectory(), { recursive: true });
        await writeFile(
          join(resourceDirectory(), 'index.yaml'),
          padding + serializeTaskIndex({ tasks: [] }),
        );
      },
    ],
  ])('refuses an oversized %s', async (_name, seed) => {
    await seed();

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });
});

describe('filesystem workflow store: stage files', () => {
  it('removes only stage files of known record names', async () => {
    await store().apply(SPEC, {
      specification: { expected: null, next: record('requirements') },
      ...creating([manifest('api')]),
    });
    const kept = [
      `.Notes.txt.${UUID}.tmp`,
      `.api.yaml.${'-'.repeat(36)}.tmp`,
      `.api.yaml.${UUID.toUpperCase()}.tmp`,
      `.Bad_Id.yaml.${UUID}.tmp`,
    ];
    for (const name of [...kept, `.api.yaml.${UUID}.tmp`]) {
      await writeTaskFile(name, 'partial');
    }

    await writeFile(join(executionDirectory(), `.specification.yaml.${UUID}.tmp`), 'partial');
    await writeFile(join(executionDirectory(), `.api.yaml.${UUID}.tmp`), 'partial');

    const before = await store().read(SPEC);
    await store().apply(SPEC, {
      runs: [
        {
          taskId: 'api',
          expected: before.runs[0]?.revision ?? null,
          next: {
            ...runRecord('api'),
            run: {
              ...runRecord('api').run,
              workflow: { ...runRecord('api').run.workflow, version: 2 },
            },
          },
        },
      ],
    });
    expect((await readdir(tasksDirectory())).sort()).toEqual(['api.yaml', ...kept].sort());
    expect((await readdir(executionDirectory())).sort()).toEqual(
      [`.api.yaml.${UUID}.tmp`, 'specification.yaml', 'tasks'].sort(),
    );
  });
});

describe('filesystem workflow store: the Task set is the one the index lists', () => {
  const operations = async () => ({
    ...memoryDependencies(await seedExecutionCatalogue()),
    store: store(),
  });

  it('keeps the wait open when an unfinished Task folder vanished, and shows that Task as broken', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await rm(join(resourceDirectory(), 'screen'), { recursive: true });

    await work(dependencies, operationTask('api'));
    const last = await work(dependencies, operationTask('api'), { result: 'pass' });

    expect(last.position).toEqual({ state: 'terminal', outcome: 'completed' });
    expect(last.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
      taskIds: ['screen'],
      blocking: [{ taskId: 'screen', cause: 'broken' }],
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification?.record.run.position).toMatchObject({
      state: 'active',
      step: 'implementation',
    });
    expect(inspection.brokenTasks).toEqual(['screen']);
    expect(inspection.issues).toEqual([
      { kind: 'dangling', taskId: 'screen', reason: 'missing-folder' },
    ]);
    expect(inspection.attention).toMatchObject([
      {
        subject: { kind: 'task', taskId: 'screen' },
        reason: 'task-broken',
        action: 'restore-task',
      },
      { subject: { kind: 'specification' }, reason: 'tasks-stuck' },
    ]);
    const broken = {
      code: 'WORKFLOW_STATE_CORRUPT',
      message: expect.stringContaining('"screen"') as unknown,
    };
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', actor: claude }),
    ).rejects.toMatchObject(broken);
    await expect(
      setTaskStatus(dependencies, {
        specId: SPEC,
        taskId: 'screen',
        status: 'cancelled',
        actor: owner,
      }),
    ).rejects.toMatchObject(broken);
  });

  it('keeps the dependents of a broken Task from starting', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await rm(join(resourceDirectory(), 'api'), { recursive: true });

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.brokenTasks).toEqual(['api']);
    expect(inspection.tasks.map((entry) => entry.readiness)).toEqual([
      { kind: 'dependencies', waitingFor: ['api'] },
    ]);
    expect(inspection.attention).toMatchObject([
      { reason: 'task-broken' },
      // The broken Task is the one to resolve; its dependent only waits for it.
      { reason: 'tasks-stuck', taskIds: ['api'] },
      // Its dependent points to restoring the broken Task.
      { reason: 'dependency-unsatisfiable', action: 'restore-task', taskIds: ['api'] },
    ]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', actor: claude }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEPENDENCY_UNSATISFIED' });
  });

  it('tells the owner when the wait cannot complete although every Task is closed', async () => {
    // The same Tasks, both completed, in another store: the source of a restored Task file.
    const finished = memoryDependencies(await seedExecutionCatalogue());
    await specificationWithTasks(finished);
    for (const id of ['api', 'screen']) {
      await work(finished, operationTask(id));
      await work(finished, operationTask(id), { result: 'pass' });
    }

    const restored = (await finished.store.read(SPEC)).runs.find(
      (entry) => entry.value.taskId === 'screen',
    );
    if (!restored) {
      throw new Error('No completed Task.');
    }

    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await work(dependencies, operationTask('api'));
    await work(dependencies, operationTask('api'), { result: 'pass' });
    await writeTaskFile('screen.yaml', serializeTaskRunRecord(restored.value));

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.brokenTasks).toEqual([]);
    expect(inspection.specification?.record.run.position).toMatchObject({
      state: 'active',
      step: 'implementation',
    });
    expect(inspection.attention).toMatchObject([
      { subject: { kind: 'specification' }, reason: 'tasks-stuck' },
    ]);
  });

  it('refuses to finish or return a broken Task', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
    await rm(join(resourceDirectory(), 'api'), { recursive: true });
    const broken = {
      code: 'WORKFLOW_STATE_CORRUPT',
      message: expect.stringContaining('"api"') as unknown,
    };

    await expect(
      finishStep(dependencies, {
        subject: operationTask('api'),
        step: 'implement',
        attempt: 1,
        input: {},
        actor: claude,
      }),
    ).rejects.toMatchObject(broken);
    await expect(
      returnToStep(dependencies, {
        subject: operationTask('api'),
        step: 'implement',
        actor: owner,
      }),
    ).rejects.toMatchObject(broken);
  });

  it('refuses a breakdown that would recreate a broken Task', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await rm(join(resourceDirectory(), 'screen'), { recursive: true });
    await returnToStep(dependencies, {
      subject: operationSpecification,
      step: 'breakdown',
      feedback: 'Again.',
      actor: owner,
    });
    await startSpecification(dependencies);

    await expect(
      finishStep(dependencies, {
        subject: operationSpecification,
        step: 'breakdown',
        attempt: 2,
        input: { tasks: [{ id: 'screen', title: 'Screen', type: 'ui-implementation' }] },
        actor: claude,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });
    await expect(readdir(join(resourceDirectory(), 'screen'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  /** A hand-written run record of a Task that ended without any attempt: not justified. */
  const unjustifiedRun = (dependencies: WorkflowDependencies, taskId: string, workflow: string) =>
    writeTaskFile(
      `${taskId}.yaml`,
      serializeTaskRunRecord({
        specId: SPEC,
        taskId,
        run: {
          ...newRun(dependencies.catalogue.workflow(workflow)!),
          position: { state: 'terminal', outcome: 'completed' },
        },
      } satisfies TaskRunRecord),
    );

  it('treats a Task whose position its history does not justify as broken', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await unjustifiedRun(dependencies, 'screen', 'task-ui');

    await work(dependencies, operationTask('api'));
    const last = await work(dependencies, operationTask('api'), { result: 'pass' });

    expect(last.specification).toEqual({
      kind: 'attention',
      step: 'implementation',
      reason: 'tasks-stuck',
      taskIds: ['screen'],
      blocking: [{ taskId: 'screen', cause: 'broken' }],
    });
    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.specification?.record.run.position).toMatchObject({
      state: 'active',
      step: 'implementation',
    });
    expect(inspection.brokenTasks).toEqual(['screen']);
    expect(inspection.attention).toMatchObject([
      {
        subject: { kind: 'task', taskId: 'screen' },
        reason: 'task-broken',
        action: 'restore-task',
      },
      { subject: { kind: 'specification' }, reason: 'tasks-stuck' },
    ]);
    const broken = {
      code: 'WORKFLOW_STATE_CORRUPT',
      message: expect.stringContaining('"screen"') as unknown,
    };
    await expect(
      setTaskStatus(dependencies, {
        specId: SPEC,
        taskId: 'screen',
        status: 'cancelled',
        actor: owner,
      }),
    ).rejects.toMatchObject(broken);
    await expect(
      returnToStep(dependencies, {
        subject: operationTask('screen'),
        step: 'implement',
        actor: owner,
      }),
    ).rejects.toMatchObject(broken);
  });

  it('keeps a broken Task with a record out of every decision on it', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await unjustifiedRun(dependencies, 'api', 'task-standard');

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.brokenTasks).toEqual(['api']);
    expect(inspection.tasks.find((entry) => entry.record.taskId === 'screen')?.readiness).toEqual({
      kind: 'dependencies',
      waitingFor: ['api'],
    });
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'screen', actor: claude }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_DEPENDENCY_UNSATISFIED' });
    const broken = {
      code: 'WORKFLOW_STATE_CORRUPT',
      message: expect.stringContaining('"api"') as unknown,
    };
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude }),
    ).rejects.toMatchObject(broken);
    await expect(
      finishStep(dependencies, {
        subject: operationTask('api'),
        step: 'implement',
        attempt: 1,
        input: {},
        actor: claude,
      }),
    ).rejects.toMatchObject(broken);

    await returnToStep(dependencies, {
      subject: operationSpecification,
      step: 'breakdown',
      feedback: 'Again.',
      actor: owner,
    });
    const started = await startSpecification(dependencies);
    expect(started.kind === 'started' && started.context.existingTasks).toMatchObject([
      { id: 'screen' },
    ]);
    expect(started.kind === 'started' && started.context.broken).toEqual(['api']);
  });

  it('refuses to complete the Specification while a Task is broken', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    for (const id of ['api', 'screen']) {
      await work(dependencies, operationTask(id));
      await work(dependencies, operationTask(id), { result: 'pass' });
    }

    const folder = join(resourceDirectory(), 'screen');
    const kept = join(root, 'kept-screen');
    await rename(folder, kept);
    const started = await startSpecification(dependencies, owner);
    if (started.kind === 'terminal') {
      throw new Error('Unexpected end.');
    }

    const accept = () =>
      finishStep(dependencies, {
        subject: operationSpecification,
        step: 'acceptance',
        attempt: started.context.attempt,
        input: {},
        actor: owner,
      });
    const before = await readFile(specificationPath(), 'utf8');
    await expect(accept()).rejects.toMatchObject({
      code: 'WORKFLOW_INPUT_INVALID',
      message: expect.stringContaining('screen') as unknown,
    });
    expect(await readFile(specificationPath(), 'utf8')).toBe(before);

    await rename(kept, folder);
    expect((await accept()).position).toEqual({ state: 'terminal', outcome: 'completed' });
  });

  it('refuses to create a Task over a folder of the same name in another case', async () => {
    const dependencies = await operations();
    await mkdir(join(resourceDirectory(), 'API'), { recursive: true });

    await expect(
      createTask(dependencies, {
        specId: SPEC,
        taskId: 'api',
        title: 'API',
        type: 'implementation',
        actor: owner,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_EXISTS' });
  });

  it('reports a run record and a folder the index does not list, and keeps the other Tasks working', async () => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    await writeTaskFile('extra.yaml', serializeTaskRunRecord(runRecord('extra')));
    await mkdir(join(resourceDirectory(), 'stray'));

    const inspection = await inspectExecution(dependencies, SPEC);
    expect(inspection.brokenTasks).toEqual(['extra']);
    expect(inspection.issues).toEqual([
      { kind: 'unregistered', taskId: 'stray' },
      { kind: 'broken', taskId: 'extra', reason: 'unregistered-run' },
    ]);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude }),
    ).resolves.toMatchObject({ kind: 'started' });
  });
});

describe('filesystem workflow store: the position follows from the history', () => {
  const operations = async () => ({
    ...memoryDependencies(await seedExecutionCatalogue()),
    store: store(),
  });

  /** Requirements finished by Claude: the Specification is ready on `specification`. */
  async function editedRun(edit: (run: WorkflowRun) => WorkflowRun) {
    const dependencies = await operations();
    await work(dependencies, operationSpecification);
    const stored = parseSpecificationRecord(await readFile(specificationPath(), 'utf8'));
    await writeFile(
      specificationPath(),
      serializeSpecificationRecord({ ...stored, run: edit(stored.run) }),
    );

    return dependencies;
  }

  it.each<[string, (run: WorkflowRun) => WorkflowRun]>([
    [
      'a ready step with an empty history',
      (run) => ({ ...run, position: { state: 'ready', step: 'acceptance' }, attempts: [] }),
    ],
    [
      'a ready step the last transition does not lead to',
      (run) => ({ ...run, position: { state: 'ready', step: 'acceptance' } }),
    ],
    [
      'a run that has not started but has a history',
      (run) => ({ ...run, position: { state: 'not-started' } }),
    ],
    [
      'an end the last transition does not lead to',
      (run) => ({ ...run, position: { state: 'terminal', outcome: 'completed' } }),
    ],
    [
      'an active step the history does not lead to',
      (run) => ({
        ...run,
        position: { state: 'active', step: 'acceptance', attempt: 1 },
        attempts: [
          ...run.attempts,
          { step: 'acceptance', attempt: 1, sequence: 2, startedAt: '2026-11-05T10:00:05.000Z' },
        ],
      }),
    ],
    [
      'a history that skips a step',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'breakdown' },
        attempts: [
          ...run.attempts,
          {
            step: 'solution',
            attempt: 1,
            sequence: 2,
            startedAt: '2026-11-05T10:00:05.000Z',
            endedAt: '2026-11-05T10:00:06.000Z',
            outcome: { kind: 'transition', transition: 'designed', artifacts: [] },
          },
        ],
      }),
    ],
    [
      'a return to a step the workflow declares no return to',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'acceptance' },
        returns: [
          {
            sequence: 2,
            at: '2026-11-05T10:00:05.000Z',
            from: { state: 'ready', step: 'specification' },
            to: 'acceptance',
          },
        ],
      }),
    ],
    [
      'a return to a declared step the run has not reached',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'breakdown' },
        returns: [
          {
            sequence: 2,
            at: '2026-11-05T10:00:05.000Z',
            from: { state: 'ready', step: 'specification' },
            to: 'breakdown',
          },
        ],
      }),
    ],
    [
      'an attempt returned to a step the workflow declares no return to',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'acceptance' },
        attempts: [
          ...run.attempts,
          {
            step: 'specification',
            attempt: 1,
            sequence: 2,
            startedAt: '2026-11-05T10:00:05.000Z',
            endedAt: '2026-11-05T10:00:06.000Z',
            outcome: { kind: 'returned', to: 'acceptance' },
          },
        ],
      }),
    ],
    [
      'an attempt returned to a declared step the run has not reached',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'solution' },
        attempts: [
          ...run.attempts,
          {
            step: 'specification',
            attempt: 1,
            sequence: 2,
            startedAt: '2026-11-05T10:00:05.000Z',
            endedAt: '2026-11-05T10:00:06.000Z',
            outcome: { kind: 'returned', to: 'solution' },
          },
        ],
      }),
    ],
    [
      'a recorded result the transition does not declare',
      (run) => ({
        ...run,
        attempts: run.attempts.map((attempt) =>
          attempt.outcome?.kind === 'transition'
            ? { ...attempt, outcome: { ...attempt.outcome, result: 'pass' } }
            : attempt,
        ),
      }),
    ],
    [
      'a work attempt without its actor',
      (run) => ({
        ...run,
        attempts: run.attempts.map(({ actor: _actor, ...attempt }) => attempt),
      }),
    ],
    [
      'an attempt started by another class than the one that finished it',
      (run) => ({
        ...run,
        attempts: run.attempts.map((attempt) => ({ ...attempt, actor: owner })),
      }),
    ],
    [
      'a return record without the feedback the return requires',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'requirements' },
        returns: [
          {
            sequence: 2,
            at: '2026-11-05T10:00:05.000Z',
            from: { state: 'ready', step: 'specification' },
            to: 'requirements',
          },
        ],
      }),
    ],
    [
      'an attempt returned without the feedback the return requires',
      (run) => ({
        ...run,
        position: { state: 'ready', step: 'specification' },
        attempts: [
          ...run.attempts,
          {
            step: 'specification',
            attempt: 1,
            sequence: 2,
            startedAt: '2026-11-05T10:00:05.000Z',
            actor: claude,
            endedAt: '2026-11-05T10:00:06.000Z',
            outcome: { kind: 'returned', to: 'specification' },
          },
        ],
      }),
    ],
  ])('refuses %s', async (_name, edit) => {
    const dependencies = await editedRun(edit);

    await expect(inspectExecution(dependencies, SPEC)).rejects.toMatchObject(corrupt);
    await expect(startSpecification(dependencies)).rejects.toMatchObject(corrupt);
  });

  it('refuses a finish from another Session once the active attempt lost its actor', async () => {
    const dependencies = await operations();
    await startSpecification(dependencies);
    const stored = parseSpecificationRecord(await readFile(specificationPath(), 'utf8'));
    await writeFile(
      specificationPath(),
      serializeSpecificationRecord({
        ...stored,
        run: {
          ...stored.run,
          attempts: stored.run.attempts.map(({ actor: _actor, ...attempt }) => attempt),
        },
      }),
    );

    await expect(inspectExecution(dependencies, SPEC)).rejects.toMatchObject(corrupt);
    await expect(
      finishStep(dependencies, {
        subject: operationSpecification,
        step: 'requirements',
        attempt: 1,
        input: {},
        actor: agent('claude', 'session-other'),
      }),
    ).rejects.toMatchObject(corrupt);
  });

  it.each<[string, readonly FinishStepInput['input'][], (run: WorkflowRun) => WorkflowRun]>([
    [
      'a recorded result other than the transition declares',
      [{}, { result: 'pass' }],
      (run) => ({
        ...run,
        attempts: run.attempts.map((attempt) =>
          attempt.outcome?.kind === 'transition' && attempt.outcome.result === 'pass'
            ? { ...attempt, outcome: { ...attempt.outcome, result: 'fail' } }
            : attempt,
        ),
      }),
    ],
    [
      'a transition without the feedback it requires',
      [{}, { result: 'fail', feedback: 'Fix it.' }],
      (run) => ({
        ...run,
        attempts: run.attempts.map((attempt) => {
          if (attempt.outcome?.kind !== 'transition') {
            return attempt;
          }

          const { feedback: _feedback, ...outcome } = attempt.outcome;

          return { ...attempt, outcome };
        }),
      }),
    ],
    [
      'an active agent attempt without its actor',
      [],
      (run) => ({
        ...run,
        position: { state: 'active', step: 'implement', attempt: 1 },
        attempts: [
          {
            step: 'implement',
            attempt: 1,
            sequence: 1,
            startedAt: run.attempts[0]?.startedAt ?? '',
          },
        ],
      }),
    ],
  ])('makes a Task broken for %s', async (_name, finishes, edit) => {
    const dependencies = await operations();
    await specificationWithTasks(dependencies);
    for (const input of finishes) {
      await work(dependencies, operationTask('api'), input);
    }

    if (finishes.length === 0) {
      await startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude });
    }

    const path = join(tasksDirectory(), 'api.yaml');
    const stored = parseTaskRunRecord(await readFile(path, 'utf8'));
    await writeFile(path, serializeTaskRunRecord({ ...stored, run: edit(stored.run) }));

    expect((await inspectExecution(dependencies, SPEC)).brokenTasks).toEqual(['api']);
    await expect(
      startTaskExecution(dependencies, { specId: SPEC, taskId: 'api', actor: claude }),
    ).rejects.toMatchObject(corrupt);
  });

  it('accepts an attempt returned to its own declared step', async () => {
    const dependencies = await editedRun((run) => ({
      ...run,
      position: { state: 'ready', step: 'specification' },
      attempts: [
        ...run.attempts,
        {
          step: 'specification',
          attempt: 1,
          sequence: 2,
          startedAt: '2026-11-05T10:00:05.000Z',
          actor: claude,
          endedAt: '2026-11-05T10:00:06.000Z',
          outcome: { kind: 'returned', to: 'specification', feedback: 'Again.' },
        },
      ],
    }));

    expect((await inspectExecution(dependencies, SPEC)).specification?.record.run.position).toEqual(
      { state: 'ready', step: 'specification' },
    );
    await expect(startSpecification(dependencies)).resolves.toMatchObject({ kind: 'started' });
  });

  it('accepts the unedited history', async () => {
    const dependencies = await editedRun((run) => run);

    expect((await inspectExecution(dependencies, SPEC)).specification?.record.run.position).toEqual(
      { state: 'ready', step: 'specification' },
    );
  });

  it('reports Task dependencies that form a cycle or name no registered Task, instead of failing', async () => {
    const manifests: TaskManifest[] = [
      { ...manifest('api'), dependsOn: ['web'] },
      { ...manifest('web'), dependsOn: ['api', 'ghost'] },
    ];
    await mkdir(resourceDirectory(), { recursive: true });
    await writeFile(
      join(resourceDirectory(), 'index.yaml'),
      serializeTaskIndex({ tasks: manifests.map((entry) => ({ id: entry.id })) }),
    );
    for (const entry of manifests) {
      await mkdir(join(resourceDirectory(), entry.id));
      await writeFile(
        join(resourceDirectory(), entry.id, 'task.yaml'),
        serializeTaskManifest(entry),
      );
    }

    expect((await store().read(SPEC)).issues).toEqual([
      { kind: 'dependency', taskId: 'web', dependency: 'ghost', reason: 'unknown' },
      { kind: 'cycle', taskId: 'api' },
      { kind: 'cycle', taskId: 'web' },
    ]);
  });
});

describe('filesystem workflow store: a Task change crashed before one of its targets', () => {
  /** A fresh Specification directory and state root, so each crash point starts from scratch. */
  let attempt = 0;
  const fresh = async () => {
    attempt += 1;
    const base = join(root, `crash-${String(attempt)}`);
    const directory = join(base, 'spec');
    await mkdir(directory, { recursive: true });

    return {
      directory,
      options: {
        stateRoot: join(base, 'state'),
        specificationDirectory: () => Promise.resolve(directory),
      },
    };
  };

  /** Creating a Task by hand (T4 `createTask`): index entry, manifest and `task.md`, no run yet. */
  const createTask = creating([manifest('api')], { runs: false });

  /**
   * Run `scenario` once without a crash to learn its targets and the state it produces, then once
   * per target with a crash right before that target is published: every read then sees the whole
   * change, and the retry (`retry`) completes it without writing it twice.
   */
  async function crashBeforeEachTarget(
    scenario: (target: ReturnType<typeof createFilesystemWorkflowStore>) => Promise<unknown>,
    retry: (target: ReturnType<typeof createFilesystemWorkflowStore>) => Promise<void>,
    prepare: (target: ReturnType<typeof createFilesystemWorkflowStore>) => Promise<void>,
  ) {
    const reference = await fresh();
    const targets: string[] = [];
    let recording = false;
    const recorder = createFilesystemWorkflowStoreForTest(reference.options, (write) => {
      if (recording) {
        targets.push(write.target);
      }

      return Promise.resolve();
    });
    await prepare(recorder);
    recording = true;
    await scenario(recorder);
    const expected = stateOfSnapshot(
      await createFilesystemWorkflowStore(reference.options).read(SPEC),
    );
    expect(targets.length).toBeGreaterThan(2);

    for (let crashAt = 0; crashAt < targets.length; crashAt += 1) {
      const { options: crashOptions, directory } = await fresh();
      let armed = false;
      let published = 0;
      const crashing = createFilesystemWorkflowStoreForTest(crashOptions, () => {
        if (armed && published++ === crashAt) {
          return Promise.reject(new Error(`Crash before ${targets[crashAt] ?? ''}.`));
        }

        return Promise.resolve();
      });
      await prepare(crashing);
      armed = true;
      await expect(scenario(crashing)).rejects.toThrow('Crash');

      const target = createFilesystemWorkflowStore(crashOptions);
      expect(
        stateOfSnapshot(await target.read(SPEC)),
        `crash before target ${String(crashAt)}`,
      ).toEqual(expected);
      await retry(target);
      expect(stateOfSnapshot(await target.read(SPEC))).toEqual(expected);
      await expect(
        readFile(join(crashOptions.stateRoot, 'engine', 'operations', 'workflow', `${SPEC}.json`)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(directory, 'tasks', 'api', 'task.md'), 'utf8')).resolves.toContain(
        '# ',
      );
    }
  }

  it.each([
    [
      'creating a Task',
      () =>
        crashBeforeEachTarget(
          (target) => target.apply(SPEC, createTask),
          async (target) => {
            // The same change again is planned against the state before it: refused, nothing doubled.
            await expect(target.apply(SPEC, createTask)).rejects.toMatchObject({
              code: 'WORKFLOW_STATE_CONFLICT',
            });
            await target.apply(SPEC, {});
          },
          async (target) => {
            await target.apply(SPEC, {
              specification: { expected: null, next: record('breakdown') },
            });
          },
        ),
    ],
    [
      'a Breakdown',
      async () => {
        const catalogue = await seedExecutionCatalogue();
        const breakdown = {
          subject: operationSpecification,
          step: 'breakdown',
          attempt: 1,
          input: { tasks: TWO_TASKS },
          actor: claude,
        } as const;
        // One clock per store, so every run of the scenario records the same timestamps.
        const clocks = new Map<unknown, ReturnType<typeof memoryDependencies>>();
        const dependencies = (target: ReturnType<typeof createFilesystemWorkflowStore>) => {
          const existing = clocks.get(target);
          if (existing) {
            return { ...existing, store: target };
          }

          const created = memoryDependencies(catalogue);
          clocks.set(target, created);

          return { ...created, store: target };
        };

        await crashBeforeEachTarget(
          (target) => finishStep(dependencies(target), breakdown),
          async (target) => {
            await expect(
              finishStep({ ...memoryDependencies(catalogue), store: target }, breakdown),
            ).resolves.toMatchObject({ replayed: true, createdTasks: ['api', 'screen'] });
          },
          async (target) => {
            await runToBreakdown(dependencies(target));
          },
        );
      },
    ],
  ])(
    '%s: reads see the whole change and the retry is safe',
    async (_name, run) => {
      await run();
    },
    120_000,
  );
});
