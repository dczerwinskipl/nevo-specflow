// Opt-in benchmark of the Specs list read on the real Engine (filesystem store, manifests, checkout
// paths, no Git) for 10, 50 and 100 Specifications of 8 Tasks each: how long a list read takes, how
// long it holds the project control lock (the longest section and all of them), and how long a
// write waits for the lock while the list is read over and over. Not part of CI: run it on Linux
// with `SPECFLOW_READ_BENCH=1 npx vitest run test/specs-list-read-benchmark.test.ts`.
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
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
  setTaskStatus,
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

interface LockSection {
  readonly waitMs: number;
  readonly heldMs: number;
}

/** The control lock sections `run` takes (the Engine's timing channel). */
async function lockSections(run: () => Promise<unknown>): Promise<LockSection[]> {
  const sections: LockSection[] = [];
  const listener = (message: unknown) => sections.push(message as LockSection);
  subscribe('nevo.specflow.engine.control-lock', listener);
  try {
    await run();
  } finally {
    unsubscribe('nevo.specflow.engine.control-lock', listener);
  }

  return sections;
}

const max = (values: readonly number[]) => values.reduce((a, b) => Math.max(a, b), 0);
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

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

    // The lock a list read holds: one short section per Specification (its snapshot read), against
    // the whole list under one section (the read before it was shortened).
    const opened = await openWorkflow(project.engine);
    const perRow = await lockSections(() => readSpecificationListingsForRead(opened, specIds));
    const whole = await lockSections(() =>
      opened.serialize(async () => {
        const unlocked = { ...opened, serialize: <T>(operation: () => Promise<T>) => operation() };
        for (const specId of specIds) {
          await readSpecificationListingForRead(unlocked, specId);
        }
      }),
    );

    // A write while the list is read over and over (an open list refreshing, several agents
    // writing): how long each write waits for the lock.
    let listing = true;
    const refreshing = (async () => {
      while (listing) {
        await readSpecificationListingsForRead(opened, specIds);
      }
    })();
    const writes = await lockSections(async () => {
      for (let write = 0; write < 10; write += 1) {
        const specId = specIds[write % specIds.length]!;
        const status = write % 2 === 0 ? 'on-hold' : 'ready';
        await setTaskStatus(opened, { specId, taskId: 'task-4', status, actor: owner });
      }
    });
    listing = false;
    await refreshing;
    const writeWaits = writes.map((section) => section.waitMs);

    console.info(
      `${count} Specifications x ${TASKS} Tasks, median of 5: discovery ${discovery.toFixed(1)} ms, ` +
        `open definitions ${open.toFixed(1)} ms, ` +
        `list rows one by one ${list.toFixed(1)} ms, list read ${batch.toFixed(1)} ms, ` +
        `Overview inspection per row ${overviewInspection.toFixed(1)} ms; ` +
        `lock per row: ${perRow.length} sections, longest ${max(perRow.map((s) => s.heldMs)).toFixed(1)} ms, ` +
        `held ${sum(perRow.map((s) => s.heldMs)).toFixed(1)} ms in all; ` +
        `one lock for the list: held ${max(whole.map((s) => s.heldMs)).toFixed(1)} ms; ` +
        `a write during refreshes waits at most ${max(writeWaits).toFixed(1)} ms ` +
        `(${writes.length} lock sections of 10 writes)`,
    );
    expect(specIds).toHaveLength(count);
  });
});
