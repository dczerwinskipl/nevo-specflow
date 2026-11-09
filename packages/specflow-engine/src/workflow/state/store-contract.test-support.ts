import { describe, expect, it } from 'vitest';

import { FEEDBACK_MAX } from '../limits';
import type { AttemptRecord, SpecificationExecutionRecord, TaskRecord } from './model';
import type { ExecutionChange, WorkflowStore } from './store';

/**
 * The behaviour every {@link WorkflowStore} shares, run against the memory store and the filesystem
 * store so the operations' tests (memory) and production (filesystem) see the same contract.
 */

export const SPEC = '0b9d2f9e-4f1c-4a8e-9d55-5f2b6c1a7e10';
export const OTHER_SPEC = '6f3c1d2e-8a4b-4c5d-9e6f-7a8b9c0d1e2f';
/** A Specification ready on `step` that lists `taskIds`. */
export const record = (
  step: string,
  specId = SPEC,
  taskIds: readonly string[] = [],
): SpecificationExecutionRecord => ({
  specId,
  archetype: 'feature',
  taskTypes: ['*'],
  taskIds,
  run: {
    workflow: { id: 'specification-standard', version: 1, revision: 'a'.repeat(64) },
    position: { state: 'ready', step },
    attempts: [],
    returns: [],
  },
});

export const task = (taskId: string, title = taskId, specId = SPEC): TaskRecord => ({
  specId,
  taskId,
  title,
  type: 'implementation',
  dependsOn: [],
  origin: { step: 'breakdown', attempt: 1 },
  status: 'ready',
  run: {
    workflow: { id: 'task-standard', version: 1, revision: 'b'.repeat(64) },
    position: { state: 'not-started' },
    attempts: [],
    returns: [],
  },
});

export const endedAttempt = (
  attempt: number,
  sequence = attempt,
  feedback?: string,
): AttemptRecord => ({
  step: 'requirements',
  attempt,
  sequence,
  startedAt: '2026-11-05T10:00:00.000Z',
  endedAt: '2026-11-05T10:00:01.000Z',
  outcome: {
    kind: 'transition',
    transition: 'agreed',
    ...(feedback !== undefined ? { feedback } : {}),
    artifacts: [],
  },
});

/** The Specification write that lists `taskIds`, for a store that has no Specification yet. */
export const listing = (...taskIds: string[]) => ({
  expected: null,
  next: record('requirements', SPEC, taskIds),
});

export function describeWorkflowStoreContract(name: string, create: () => WorkflowStore): void {
  describe(`${name}: workflow store contract`, () => {
    const seeded = async () => {
      const store = create();
      await store.apply(SPEC, {
        specification: { expected: null, next: record('requirements', SPEC, ['web', 'api']) },
        tasks: [
          { taskId: 'web', expected: null, next: task('web') },
          { taskId: 'api', expected: null, next: task('api') },
        ],
      });

      return store;
    };

    it('reads back what it applied, Tasks in id order, and accepts writes at the read revision', async () => {
      const store = await seeded();
      const snapshot = await store.read(SPEC);
      expect(snapshot.specification?.value).toEqual(record('requirements', SPEC, ['web', 'api']));
      expect(snapshot.tasks.map((entry) => entry.value.taskId)).toEqual(['api', 'web']);
      expect(await store.read(OTHER_SPEC)).toEqual({ tasks: [] });

      await store.apply(SPEC, {
        specification: {
          expected: snapshot.specification?.revision ?? null,
          next: record('solution', SPEC, ['web', 'api']),
        },
        tasks: [
          {
            taskId: 'api',
            expected: snapshot.tasks[0]?.revision ?? null,
            next: task('api', 'API'),
          },
        ],
      });
      const next = await store.read(SPEC);
      expect(next.specification?.value.run.position).toEqual({ state: 'ready', step: 'solution' });
      expect(next.tasks.map((entry) => entry.value.title)).toEqual(['API', 'web']);
    });

    it('refuses writes planned against another revision and writes nothing', async () => {
      const store = await seeded();
      const before = await store.read(SPEC);

      for (const change of [
        {
          specification: { expected: null, next: record('solution') },
          tasks: [],
        },
        {
          tasks: [
            { taskId: 'api', expected: before.tasks[0]?.revision ?? null, next: task('api', 'x') },
            { taskId: 'web', expected: 'f'.repeat(64), next: task('web', 'y') },
          ],
        },
      ] satisfies ExecutionChange[]) {
        await expect(store.apply(SPEC, change)).rejects.toMatchObject({
          code: 'WORKFLOW_STATE_CONFLICT',
        });
      }

      expect(await store.read(SPEC)).toEqual(before);
    });

    it.each<[string, () => ExecutionChange]>([
      [
        'a valid Specification next to a Task over the title limit',
        () => ({
          specification: listing('api'),
          tasks: [{ taskId: 'api', expected: null, next: task('api', 'x'.repeat(201)) }],
        }),
      ],
      [
        'a Task with an unknown status',
        () => ({
          specification: listing('api'),
          tasks: [
            {
              taskId: 'api',
              expected: null,
              next: { ...task('api'), status: 'blocked' } as unknown as TaskRecord,
            },
          ],
        }),
      ],
      [
        'a Task write naming another Task',
        () => ({
          specification: listing('api', 'web'),
          tasks: [{ taskId: 'api', expected: null, next: task('web') }],
        }),
      ],
      [
        'a Task of another Specification',
        () => ({
          specification: listing('api'),
          tasks: [{ taskId: 'api', expected: null, next: task('api', 'api', OTHER_SPEC) }],
        }),
      ],
      [
        'a Specification record of another Specification',
        () => ({
          specification: { expected: null, next: record('requirements', OTHER_SPEC) },
          tasks: [],
        }),
      ],
      [
        'an active position without its attempt',
        () => ({
          specification: {
            expected: null,
            next: {
              ...record('requirements'),
              run: {
                ...record('requirements').run,
                position: { state: 'active', step: 'requirements', attempt: 1 },
              },
            },
          },
          tasks: [],
        }),
      ],
      [
        'a Task the Specification does not list',
        () => ({
          specification: listing('web'),
          tasks: [{ taskId: 'api', expected: null, next: task('api') }],
        }),
      ],
      [
        'a Task without a Specification that lists it',
        () => ({ tasks: [{ taskId: 'api', expected: null, next: task('api') }] }),
      ],
    ])('writes nothing for %s', async (_name, change) => {
      const store = create();

      await expect(store.apply(SPEC, change())).rejects.toMatchObject({
        code: 'WORKFLOW_STATE_CORRUPT',
      });
      expect(await store.read(SPEC)).toEqual({ tasks: [] });
    });

    it('refuses a record over the byte budget as invalid input and writes nothing', async () => {
      const store = create();
      const change: ExecutionChange = {
        specification: {
          expected: null,
          next: {
            ...record('solution'),
            run: {
              ...record('solution').run,
              attempts: Array.from({ length: 20 }, (_, index) =>
                endedAttempt(index + 1, index + 1, 'x'.repeat(FEEDBACK_MAX)),
              ),
            },
          },
        },
        tasks: [],
      };

      await expect(store.apply(SPEC, change)).rejects.toMatchObject({
        code: 'WORKFLOW_INPUT_INVALID',
      });
      expect(await store.read(SPEC)).toEqual({ tasks: [] });
    });

    it('keeps a Task status with its last change', async () => {
      const store = create();
      const held: TaskRecord = {
        ...task('api'),
        status: 'on-hold',
        statusChange: { source: 'escalation', at: '2026-11-05T10:00:00.000Z', reason: 'Unclear.' },
      };
      await store.apply(SPEC, {
        specification: listing('api', 'web'),
        tasks: [
          { taskId: 'api', expected: null, next: held },
          { taskId: 'web', expected: null, next: { ...task('web'), status: 'draft' } },
        ],
      });

      expect((await store.read(SPEC)).tasks.map((entry) => entry.value)).toEqual([
        held,
        { ...task('web'), status: 'draft' },
      ]);
    });

    it('reads a listed Task without a record as missing, not as an error', async () => {
      const store = create();
      await store.apply(SPEC, {
        specification: listing('api', 'web'),
        tasks: [{ taskId: 'api', expected: null, next: task('api') }],
      });

      const snapshot = await store.read(SPEC);
      expect(snapshot.specification?.value.taskIds).toEqual(['api', 'web']);
      expect(snapshot.tasks.map((entry) => entry.value.taskId)).toEqual(['api']);
    });
  });
}
