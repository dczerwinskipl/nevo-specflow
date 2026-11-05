import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { symlinksAvailable } from '../../../test/support/platform';

import { sha256Hex } from '../../hash';
import { finishStep } from '../operations/finish';
import { inspectExecution } from '../operations/inspect';
import { memoryDependencies, seedExecutionCatalogue } from '../operations/operations.test-support';
import { startSpecificationExecution } from '../operations/start';
import { TASKS_PER_SPECIFICATION_MAX } from '../limits';
import { serializeAttention, serializeSpecificationRecord, serializeTaskRecord } from './codec';
import {
  createFilesystemWorkflowStore,
  createFilesystemWorkflowStoreForTest,
  EXECUTION_DIRECTORY,
} from './filesystem-store';
import type { JournalWrite } from './journal';
import type { ExecutionChange } from './store';
import { noAttention, OTHER_SPEC, record, SPEC, task } from './store-contract.test-support';

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
const tasksDirectory = () => join(executionDirectory(), 'tasks');
const journalPath = () => join(stateRoot, 'engine', 'operations', 'workflow', `${SPEC}.json`);

async function writeJournal(writes: readonly unknown[]): Promise<void> {
  await mkdir(join(stateRoot, 'engine', 'operations', 'workflow'), { recursive: true });
  await writeFile(journalPath(), JSON.stringify({ version: 1, specId: SPEC, writes }));
}

async function seedSpecification(step = 'requirements') {
  const target = store();
  await target.apply(SPEC, {
    specification: { expected: null, next: record(step) },
    tasks: [],
    attention: noAttention,
  });

  return target;
}

describe('filesystem workflow store', () => {
  it('runs the operations end to end and keeps the canonical state next to the Specification', async () => {
    const dependencies = { ...memoryDependencies(await seedExecutionCatalogue()), store: store() };
    const executor = { kind: 'agent', provider: 'antigravity', sessionId: 's' } as const;
    await startSpecificationExecution(dependencies, {
      specId: SPEC,
      archetype: 'feature',
      executor,
    });
    await finishStep(dependencies, {
      subject: { kind: 'specification', specId: SPEC },
      step: 'requirements',
      attempt: 1,
      input: { feedback: 'Scope agreed.' },
      executor,
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
        tasks: [],
        attention: noAttention,
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
      tasks: [],
      attention: noAttention,
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
      { target: 'task', taskId: 'api', text: serializeTaskRecord(task('api')), expected: null },
    ]);

    const read = await target.read(SPEC);
    expect(read.specification?.value.run.position).toEqual({ state: 'ready', step: 'solution' });
    expect(read.tasks.map((entry) => entry.value.taskId)).toEqual(['api']);
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
        tasks: [],
        attention: noAttention,
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
    await target.apply(SPEC, {
      tasks: [{ taskId: 'api', expected: null, next: task('api') }],
      attention: noAttention,
    });
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
    }

    expect((await target.read(SPEC)).tasks.map((entry) => entry.value.taskId)).toEqual(['api']);

    await writeFile(join(tasksDirectory(), 'Not_A_Task.yaml'), 'not a record');
    await expect(target.read(SPEC)).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });
  });

  it('ignores stage files of an interrupted write and removes them on the next change', async () => {
    const target = store();
    await target.apply(SPEC, {
      tasks: [{ taskId: 'api', expected: null, next: task('api') }],
      attention: noAttention,
    });
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    await writeFile(join(tasksDirectory(), `.api.yaml.${uuid}.tmp`), 'version: 1\npartial');
    await writeFile(join(executionDirectory(), `.specification.yaml.${uuid}.tmp`), 'partial');

    const read = await target.read(SPEC);
    expect(read.tasks.map((entry) => entry.value.taskId)).toEqual(['api']);
    await target.apply(SPEC, {
      specification: { expected: null, next: record('requirements') },
      tasks: [],
      attention: noAttention,
    });
    expect(await readdir(tasksDirectory())).toEqual(['api.yaml']);
    expect((await readdir(executionDirectory())).sort()).toEqual(['specification.yaml', 'tasks']);
  });

  it.each<[string, () => ExecutionChange]>([
    [
      'a Task title over the limit',
      () => ({
        tasks: [{ taskId: 'api', expected: null, next: task('api', 'x'.repeat(201)) }],
        attention: noAttention,
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
        tasks: [{ taskId: 'api', expected: null, next: task('api') }],
        attention: noAttention,
      }),
    ],
    [
      'an attention item that would not read back',
      () => ({
        tasks: [],
        attention: {
          set: [
            {
              subject: { kind: 'specification', specId: SPEC },
              step: 'Not An Id',
              reason: 'owner-action',
              createdAt: '2026-11-05T10:00:00.000Z',
            },
          ],
          clear: [],
        },
      }),
    ],
  ])('writes nothing for %s, and later reads still work', async (_name, change) => {
    const target = store();

    await expect(target.apply(SPEC, change())).rejects.toMatchObject({
      code: 'WORKFLOW_STATE_CORRUPT',
    });
    await expect(readdir(executionDirectory())).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(journalPath(), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await target.read(SPEC)).toEqual({ tasks: [], attention: [] });
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

describe('filesystem workflow store: identity of the stored records', () => {
  it('refuses a Task record whose id is not its file name', async () => {
    await writeTaskFile('api.yaml', serializeTaskRecord(task('web')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it('refuses a Task record of another Specification', async () => {
    await writeTaskFile('api.yaml', serializeTaskRecord(task('api', 'api', OTHER_SPEC)));

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
      { target: 'task', taskId: 'api', text: serializeTaskRecord(task('api')), expected: null },
      {
        target: 'task',
        taskId: 'api',
        text: serializeTaskRecord(task('api', 'B')),
        expected: null,
      },
    ]);

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
    await expect(
      store().apply(SPEC, {
        tasks: [{ taskId: 'api', expected: null, next: task('api') }],
        attention: noAttention,
      }),
    ).rejects.toMatchObject(corrupt);
    expect(await readdir(outside())).toEqual(['specification.yaml']);
  });

  it('refuses a Task folder that is a link', async () => {
    await mkdir(executionDirectory(), { recursive: true });
    await linkDirectory(outside(), tasksDirectory());
    await writeFile(join(outside(), 'api.yaml'), serializeTaskRecord(task('api')));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(
      store().apply(SPEC, {
        tasks: [{ taskId: 'web', expected: null, next: task('web') }],
        attention: noAttention,
      }),
    ).rejects.toMatchObject(corrupt);
    expect(await readdir(outside())).toEqual(['api.yaml']);
  });

  it('refuses an attention or journal folder that is a link', async () => {
    await seedSpecification();
    const attentionDirectory = join(stateRoot, 'engine', 'workflow', 'attention');
    const journalDirectory = join(stateRoot, 'engine', 'operations', 'workflow');
    await rm(attentionDirectory, { recursive: true, force: true });
    await linkDirectory(outside(), attentionDirectory);
    await writeFile(join(outside(), `${SPEC}.json`), serializeAttention([]));

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await rm(attentionDirectory);
    await rm(journalDirectory, { recursive: true, force: true });
    await linkDirectory(join(root, 'outside-journal'), journalDirectory);

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
  });

  it.skipIf(!symlinksAvailable)('refuses a record file that is a link', async () => {
    await mkdir(outside(), { recursive: true });
    await writeFile(join(outside(), 'api.yaml'), serializeTaskRecord(task('api')));
    await mkdir(tasksDirectory(), { recursive: true });
    await symlink(join(outside(), 'api.yaml'), join(tasksDirectory(), 'api.yaml'), 'file');

    await expect(store().read(SPEC)).rejects.toMatchObject(corrupt);
    await expect(
      store().apply(SPEC, {
        tasks: [{ taskId: 'web', expected: null, next: task('web') }],
        attention: noAttention,
      }),
    ).rejects.toMatchObject(corrupt);
  });
});

describe('filesystem workflow store: publication re-checks each target', () => {
  it('refuses to overwrite a target that changed after the change was planned', async () => {
    const seeded = await seedSpecification();
    const before = await seeded.read(SPEC);
    const external = serializeTaskRecord(task('api', 'from git'));
    const target = storeWithPublishHook(async (write) => {
      if (write.target === 'task') {
        await writeTaskFile('api.yaml', external);
      }
    });

    await expect(
      target.apply(SPEC, {
        specification: {
          expected: before.specification?.revision ?? null,
          next: record('solution'),
        },
        tasks: [{ taskId: 'api', expected: null, next: task('api') }],
        attention: noAttention,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
    expect(await readFile(join(tasksDirectory(), 'api.yaml'), 'utf8')).toBe(external);
    // The journal stays pending: deleting it by hand keeps the partly applied change.
    expect(JSON.parse(await readFile(journalPath(), 'utf8'))).toMatchObject({ specId: SPEC });
  });
});

describe('filesystem workflow store: read budgets', () => {
  it('refuses more Task records than a Specification may have', async () => {
    for (let index = 0; index <= TASKS_PER_SPECIFICATION_MAX; index += 1) {
      const taskId = `t-${String(index)}`;
      await writeTaskFile(`${taskId}.yaml`, serializeTaskRecord(task(taskId)));
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
    ['Task record', () => writeTaskFile('api.yaml', padding + serializeTaskRecord(task('api')))],
    [
      'attention list',
      async () => {
        await seedSpecification();
        await mkdir(join(stateRoot, 'engine', 'workflow', 'attention'), { recursive: true });
        await writeFile(
          join(stateRoot, 'engine', 'workflow', 'attention', `${SPEC}.json`),
          serializeAttention([]).replace('{', `{${' '.repeat(2 * 1024 * 1024)}`),
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
      tasks: [{ taskId: 'api', expected: null, next: task('api') }],
      attention: noAttention,
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

    await store().apply(SPEC, {
      specification: { expected: null, next: record('requirements') },
      tasks: [],
      attention: noAttention,
    });
    expect((await readdir(tasksDirectory())).sort()).toEqual(['api.yaml', ...kept].sort());
    expect((await readdir(executionDirectory())).sort()).toEqual(
      [`.api.yaml.${UUID}.tmp`, 'specification.yaml', 'tasks'].sort(),
    );
  });
});
