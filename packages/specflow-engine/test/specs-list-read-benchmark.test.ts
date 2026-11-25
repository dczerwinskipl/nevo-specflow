// Opt-in benchmark of the Specs list read on the real Engine (filesystem store, manifests, checkout
// paths, no Git) for 10, 50 and 100 Specifications of 8 Tasks each. Not part of CI: run it on Linux
// with `SPECFLOW_READ_BENCH=1 npx vitest run test/specs-list-read-benchmark.test.ts`.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readCanonicalSpecSources } from '../src';
import { installDefinitionsForTesting } from '../src/definitions/testing-install';
import {
  initialTaskDocument,
  serializeTaskIndex,
  serializeTaskManifest,
} from '../src/tasks/resource/codec';
import type { TaskManifest } from '../src/tasks/resource/model';
import {
  openWorkflow,
  readExecutionForRead,
  readSpecificationListingForRead,
  readSpecificationListingsForRead,
  startSpecificationExecution,
  startTaskExecution,
} from '../src/workflow';
import { removeTrackedRoots } from './support/documents-fixture';
import { writableProject } from './support/document-writes';
import { writeSpecificationManifestFixture } from './support/manifest-fixture';

afterEach(removeTrackedRoots);

const TASKS = 8;
const owner = { class: 'human', details: { actorId: 'owner', trust: 'local' } } as const;

/** A draft, a cancelled Task, a chain, and context on one Task: the mix the list has to decide. */
function manifest(index: number): TaskManifest {
  return {
    id: `task-${index}`,
    title: `Task ${index}`,
    type: 'implementation',
    status: index === 0 ? 'draft' : index === 1 ? 'cancelled' : 'ready',
    dependsOn: index >= 5 ? [`task-${index - 1}`] : [],
    origin: { kind: 'manual', actorId: 'local:me' },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    ...(index === 3 ? { context: [{ kind: 'path', path: 'src', required: true }] } : {}),
  };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function measure(read: () => Promise<unknown>): Promise<number> {
  await read();
  const times: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    await read();
    times.push(performance.now() - started);
  }

  return median(times);
}

describe.skipIf(!process.env.SPECFLOW_READ_BENCH)('the Specs list read', () => {
  it.each([10, 50, 100])('reads %i Specifications', { timeout: 1_800_000 }, async (count) => {
    const project = await writableProject({ git: false, notes: 1 });
    await installDefinitionsForTesting(project.engine);
    await mkdir(join(project.root, 'src'), { recursive: true });
    const specIds: string[] = [];
    for (let spec = 0; spec < count; spec += 1) {
      const slug = `bench-${spec}`;
      const written = await writeSpecificationManifestFixture(project.root, {
        slug,
        archetypeId: 'feature',
      });
      specIds.push(written.specId);
      const dir = join(project.root, 'specs', 'active', slug);
      await writeFile(join(dir, 'overview.md'), '# Bench\n');
      const manifests = Array.from({ length: TASKS }, (_, index) => manifest(index));
      await mkdir(join(dir, 'tasks'), { recursive: true });
      await writeFile(
        join(dir, 'tasks', 'index.yaml'),
        serializeTaskIndex({ tasks: manifests.map((entry) => ({ id: entry.id })) }),
      );
      for (const entry of manifests) {
        await mkdir(join(dir, 'tasks', entry.id), { recursive: true });
        await writeFile(join(dir, 'tasks', entry.id, 'task.yaml'), serializeTaskManifest(entry));
        await writeFile(join(dir, 'tasks', entry.id, 'task.md'), initialTaskDocument(entry));
      }
    }

    const workflow = await openWorkflow(project.engine);
    for (const [index, specId] of specIds.entries()) {
      // Half of them have started their workflow; every Specification has one Task in progress.
      if (index % 2 === 0) {
        await startSpecificationExecution(workflow, { specId, archetype: 'feature', actor: owner });
      }

      await startTaskExecution(workflow, { specId, taskId: 'task-2', actor: owner });
    }

    const discovery = await measure(() => readCanonicalSpecSources(project.engine));
    const open = await measure(() => openWorkflow(project.engine));
    const list = await measure(async () => {
      const opened = await openWorkflow(project.engine);
      for (const specId of specIds) {
        await readSpecificationListingForRead(opened, specId);
      }
    });
    const batch = await measure(async () =>
      readSpecificationListingsForRead(await openWorkflow(project.engine), specIds),
    );
    const overviewInspection = await measure(async () => {
      const opened = await openWorkflow(project.engine);
      for (const specId of specIds) {
        await readExecutionForRead(opened, specId, { tasks: [] });
      }
    });
    console.info(
      `${count} Specifications x ${TASKS} Tasks, median of 5: discovery ${discovery.toFixed(1)} ms, ` +
        `open definitions ${open.toFixed(1)} ms, ` +
        `list rows one lock each ${list.toFixed(1)} ms, list rows under one lock ${batch.toFixed(1)} ms, ` +
        `Overview inspection per row ${overviewInspection.toFixed(1)} ms`,
    );
    expect(specIds).toHaveLength(count);
  });
});
