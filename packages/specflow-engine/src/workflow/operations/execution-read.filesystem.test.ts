import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { serializeTaskIndex, serializeTaskManifest } from '../../tasks/resource/codec';
import { TASK_MAIN_DOCUMENT, type TaskManifest } from '../../tasks/resource/model';
import { createFilesystemWorkflowStore } from '../state/filesystem-store';
import type { WorkflowStore } from '../state/store';
import { inspectActions } from './actions';
import { readExecution } from './execution-read';
import {
  fakeReferences,
  memoryDependencies,
  seedExecutionCatalogue,
  SPEC,
} from './operations.test-support';
import type { TaskReferences } from './task-references';

const COUNT = 200;
const id = (index: number) => `task-${String(index).padStart(3, '0')}`;

let root: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'execution-read-fs-')));
  await mkdir(join(root, 'state'), { recursive: true });
  await mkdir(join(root, 'spec'), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Every call of each method, so a test can bound the filesystem work of one read. */
function counted<T extends object>(target: T, calls: Map<string, number>): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver) as unknown;
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        calls.set(String(property), (calls.get(String(property)) ?? 0) + 1);

        return (value as (...parameters: unknown[]) => unknown).apply(object, args);
      };
    },
  });
}

// The read of every Task must not do per-Task filesystem work: one store read, no Task folder
// listing, each reference lookup once (a memory store hides what the filesystem store costs).
describe('the execution read on the filesystem store', () => {
  it(
    'reads 200 Tasks with one store read and no per-Task listing',
    { timeout: 30_000 },
    async () => {
      const store = createFilesystemWorkflowStore({
        stateRoot: join(root, 'state'),
        specificationDirectory: () => Promise.resolve(join(root, 'spec')),
      });
      const manifests = Array.from({ length: COUNT }, (_, index): TaskManifest => ({
        id: id(index),
        title: id(index),
        type: 'implementation',
        status: index % 10 === 0 ? 'draft' : 'ready',
        dependsOn: index % 3 === 0 && index > 0 ? [id(index - 1)] : [],
        origin: { kind: 'manual', actorId: 'owner' },
        documents: [{ ...TASK_MAIN_DOCUMENT }],
      }));
      // The files as a checkout holds them, written directly (faster than one change through the
      // store's journal and commit steps).
      const tasks = join(root, 'spec', 'tasks');
      await mkdir(tasks, { recursive: true });
      await writeFile(
        join(tasks, 'index.yaml'),
        serializeTaskIndex({ tasks: manifests.map((entry) => ({ id: entry.id })) }),
      );
      await Promise.all(
        manifests.map(async (entry) => {
          await mkdir(join(tasks, entry.id));
          await writeFile(join(tasks, entry.id, 'task.yaml'), serializeTaskManifest(entry));
        }),
      );

      const storeCalls = new Map<string, number>();
      const referenceCalls = new Map<string, number>();
      const dependencies = {
        ...memoryDependencies(await seedExecutionCatalogue()),
        store: counted<WorkflowStore>(store, storeCalls),
        references: counted<TaskReferences>(fakeReferences(), referenceCalls),
      };

      const started = performance.now();
      const reading = await readExecution(dependencies, SPEC, { tasks: 'all' });
      const overview = performance.now() - started;
      expect(reading.facts.size).toBe(COUNT);
      expect(Object.fromEntries(storeCalls)).toEqual({ read: 1 });
      // Each lookup once per read, whatever the number of Tasks.
      for (const [method, calls] of referenceCalls) {
        expect([method, calls]).toEqual([method, 1]);
      }

      storeCalls.clear();
      referenceCalls.clear();
      const detailStarted = performance.now();
      await inspectActions(dependencies, { kind: 'task', specId: SPEC, taskId: id(199) });
      const detail = performance.now() - detailStarted;
      // The detail lists its own folder once (the files `remove` refuses).
      expect(Object.fromEntries(storeCalls)).toEqual({ read: 1, taskFiles: 1 });

      console.info(
        `filesystem store, ${COUNT} Tasks: execution read ${overview.toFixed(1)} ms, ` +
          `Task detail ${detail.toFixed(1)} ms`,
      );
    },
  );
});
