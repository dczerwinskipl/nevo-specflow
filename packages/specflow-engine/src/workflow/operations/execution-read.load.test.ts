import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TASK_MAIN_DOCUMENT, type TaskManifest } from '../../tasks/resource/model';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions } from './actions';
import { readExecution } from './execution-read';
import { memoryDependencies, seedExecutionCatalogue, SPEC } from './operations.test-support';

// Counts the dependency graph traversals (each walks the whole graph once).
const traversals = vi.hoisted(() => ({ count: 0 }));
vi.mock('../state/dependency-cycle', async (original) => {
  const actual = await original<typeof import('../state/dependency-cycle')>();

  return {
    dependencyCycle: (graph: ReadonlyMap<string, readonly string[]>) => {
      traversals.count += 1;

      return actual.dependencyCycle(graph);
    },
  };
});

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

/**
 * `count` approved Tasks that never started, each depending on the two before it, written in one
 * change (the store validates the whole state once), so every Task is projected by a read.
 */
async function approvedChain(count: number) {
  const dependencies = memoryDependencies(catalogue);
  const ids = Array.from({ length: count }, (_, index) => `task-${String(index).padStart(3, '0')}`);
  const manifest = (id: string, index: number): TaskManifest => ({
    id,
    title: id,
    type: 'implementation',
    status: 'ready',
    dependsOn: ids.slice(Math.max(0, index - 2), index),
    origin: { kind: 'manual', actorId: 'owner' },
    documents: [{ ...TASK_MAIN_DOCUMENT }],
  });
  await dependencies.store.apply(SPEC, {
    index: { expected: null, next: { tasks: ids.map((id) => ({ id })) } },
    manifests: ids.map((id, index) => ({ taskId: id, expected: null, next: manifest(id, index) })),
  });

  // The time the read holds the project lock (`serialize`).
  let held = 0;
  const timed = {
    ...dependencies,
    serialize: async <T>(operation: () => Promise<T>) => {
      const started = performance.now();
      try {
        return await dependencies.serialize(operation);
      } finally {
        held = performance.now() - started;
      }
    },
  };

  return { dependencies: timed, ids, held: () => held };
}

describe('the execution read under load', () => {
  it.each([100, 200])(
    'reads %i approved Tasks with dependencies without authoring work',
    async (count) => {
      const { dependencies, ids, held } = await approvedChain(count);

      traversals.count = 0;
      const reading = await readExecution(dependencies, SPEC, { tasks: 'all' });
      const readHeld = held();
      const readTraversals = traversals.count;

      expect(reading.facts.size).toBe(count);
      expect(reading.facts.get(ids[0]!)?.startable).toBe(true);
      expect(reading.facts.get(ids[1]!)?.dependencyWait?.waitingFor).toEqual([ids[0]]);
      // No Task of the read carries its authoring data, and no dependency graph is walked.
      expect([...reading.actions.values()].some((entry) => entry.taskAuthoring)).toBe(false);
      expect(readTraversals).toBe(0);

      // The authoring read of one Task walks the graph a bounded number of times, not once per
      // candidate.
      traversals.count = 0;
      const last = ids[count - 1]!;
      const projection = await inspectActions(dependencies, {
        kind: 'task',
        specId: SPEC,
        taskId: last,
      });
      const detailHeld = held();
      expect(projection.taskAuthoring?.dependencyCandidates).toHaveLength(count - 1);
      expect(
        projection.taskAuthoring?.dependencyCandidates.find((entry) => entry.taskId === ids[0]),
      ).toEqual({ taskId: ids[0] });
      // The first Task depends on nothing, so any other Task as its dependency closes a cycle.
      const first = await inspectActions(dependencies, {
        kind: 'task',
        specId: SPEC,
        taskId: ids[0]!,
      });
      expect(
        first.taskAuthoring?.dependencyCandidates.every(
          (entry) => entry.unavailable === 'would-create-cycle',
        ),
      ).toBe(true);
      expect(traversals.count).toBeLessThanOrEqual(2);

      // A timing note for the report (not asserted: machines differ).
      console.info(
        `execution read of ${count} Tasks: ${readHeld.toFixed(1)} ms held, ` +
          `${readTraversals} traversals; Task detail: ${detailHeld.toFixed(1)} ms`,
      );
    },
  );
});
