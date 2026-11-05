import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../hash';
import { finishStep } from '../operations/finish';
import { inspectExecution } from '../operations/inspect';
import { memoryDependencies, seedExecutionCatalogue } from '../operations/operations.test-support';
import { startSpecificationExecution } from '../operations/start';
import { serializeSpecificationRecord, serializeTaskRecord } from './codec';
import { createFilesystemWorkflowStore, EXECUTION_DIRECTORY } from './filesystem-store';
import type { SpecificationExecutionRecord, TaskRecord } from './model';
import type { ExecutionChange } from './store';

const SPEC = '0b9d2f9e-4f1c-4a8e-9d55-5f2b6c1a7e10';
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

const store = () =>
  createFilesystemWorkflowStore({
    stateRoot,
    specificationDirectory: () => Promise.resolve(specificationDirectory),
  });

const record = (step: string): SpecificationExecutionRecord => ({
  specId: SPEC,
  archetype: 'feature',
  taskTypes: ['*'],
  run: {
    workflow: { id: 'specification-standard', version: 1, revision: 'a'.repeat(64) },
    position: { state: 'ready', step },
    attempts: [],
    returns: [],
  },
});

const task = (taskId: string, title = taskId): TaskRecord => ({
  specId: SPEC,
  taskId,
  title,
  type: 'implementation',
  dependsOn: [],
  origin: { step: 'create-tasks', attempt: 1 },
  run: {
    workflow: { id: 'task-standard', version: 1, revision: 'b'.repeat(64) },
    position: { state: 'not-started' },
    attempts: [],
    returns: [],
  },
});

const noAttention = { set: [], clear: [] };
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
    await startSpecificationExecution(dependencies, { specId: SPEC, archetype: 'feature' });
    await finishStep(dependencies, {
      subject: { kind: 'specification', specId: SPEC },
      step: 'requirements',
      attempt: 1,
      input: { feedback: 'Scope agreed.' },
      executor: { kind: 'agent', provider: 'antigravity', sessionId: 's' },
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
