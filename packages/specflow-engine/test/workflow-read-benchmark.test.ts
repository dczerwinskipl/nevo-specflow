// Opt-in benchmark of the presentation reads of a Specification with 200 Tasks on the real Engine
// (filesystem store, Specification manifest, checkout paths). Not part of CI: run it on Linux with
// `SPECFLOW_READ_BENCH=1 npx vitest run test/workflow-read-benchmark.test.ts`.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  serializeTaskIndex,
  serializeTaskManifest,
  initialTaskDocument,
} from '../src/tasks/resource/codec';
import { installDefinitionsForTesting } from '../src/definitions/testing-install';
import type { TaskManifest } from '../src/tasks/resource/model';
import {
  inspectActionsForRead,
  openWorkflow,
  readExecutionForRead,
  readTaskProgressForRead,
  startTaskExecution,
} from '../src/workflow';
import { removeTrackedRoots } from './support/documents-fixture';
import { writableProject } from './support/document-writes';

afterEach(removeTrackedRoots);

const COUNT = 200;
const owner = { class: 'human', details: { actorId: 'owner', trust: 'local' } } as const;
const id = (index: number) => `task-${String(index).padStart(3, '0')}`;

/** Drafts, cancelled Tasks, chains, fan-in and a few context paths. */
function manifest(index: number): TaskManifest {
  const dependsOn =
    index % 20 === 19
      ? Array.from({ length: 10 }, (_, offset) => id(index - 1 - offset))
      : index % 3 === 0 && index > 0
        ? [id(index - 1)]
        : [];

  return {
    id: id(index),
    title: `Task ${index}`,
    type: 'implementation',
    status: index % 10 === 0 ? 'draft' : index % 10 === 1 ? 'cancelled' : 'ready',
    dependsOn,
    origin: { kind: 'manual', actorId: 'local:me' },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    ...(index % 25 === 2 ? { context: [{ kind: 'path', path: 'src', required: true }] } : {}),
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function measure(read: () => Promise<unknown>): Promise<number> {
  await read();
  await read();
  const times: number[] = [];
  for (let run = 0; run < 10; run += 1) {
    const started = performance.now();
    await read();
    times.push(performance.now() - started);
  }

  return median(times);
}

describe.skipIf(!process.env.SPECFLOW_READ_BENCH)('presentation reads of 200 Tasks', () => {
  it('reads the Overview, the progress and one Task detail', { timeout: 600_000 }, async () => {
    const project = await writableProject({ git: false, notes: 1 });
    await installDefinitionsForTesting(project.engine);
    await mkdir(join(project.root, 'src'), { recursive: true });
    const manifests = Array.from({ length: COUNT }, (_, index) => manifest(index));
    await mkdir(join(project.dir, 'tasks'), { recursive: true });
    await writeFile(
      join(project.dir, 'tasks', 'index.yaml'),
      serializeTaskIndex({ tasks: manifests.map((entry) => ({ id: entry.id })) }),
    );
    for (const entry of manifests) {
      const folder = join(project.dir, 'tasks', entry.id);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'task.yaml'), serializeTaskManifest(entry));
      await writeFile(join(folder, 'task.md'), initialTaskDocument(entry));
    }

    const workflow = await openWorkflow(project.engine);
    // A few started Tasks (ready, without dependencies).
    let started = 0;
    for (const entry of manifests) {
      if (
        started < 5 &&
        entry.status === 'ready' &&
        entry.dependsOn.length === 0 &&
        !entry.context
      ) {
        await startTaskExecution(workflow, {
          specId: project.specId,
          taskId: entry.id,
          actor: owner,
        });
        started += 1;
      }
    }

    const overview = await measure(() =>
      readExecutionForRead(workflow, project.specId, { tasks: 'all' }),
    );
    const progress = await measure(() => readTaskProgressForRead(workflow, project.specId));
    const detail = await measure(() =>
      inspectActionsForRead(workflow, { kind: 'task', specId: project.specId, taskId: id(199) }),
    );
    console.info(
      `200 Tasks (${started} started), median of 10: Overview ${overview.toFixed(1)} ms, ` +
        `progress ${progress.toFixed(1)} ms, Task detail ${detail.toFixed(1)} ms`,
    );
    expect(started).toBe(5);
  });
});
