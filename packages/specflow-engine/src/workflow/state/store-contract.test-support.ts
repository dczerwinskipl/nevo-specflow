import { describe, expect, it } from 'vitest';

import { TASK_MAIN_DOCUMENT, type TaskManifest } from '../../tasks/resource/model';
import { FEEDBACK_MAX } from '../limits';
import type { AttemptRecord, SpecificationExecutionRecord, TaskRunRecord } from './model';
import type { ExecutionChange, ExecutionSnapshot, WorkflowStore } from './store';

/**
 * The behaviour every {@link WorkflowStore} shares, run against the memory store and the filesystem
 * store so the operations' tests (memory) and production (filesystem) see the same contract.
 */

export const SPEC = '0b9d2f9e-4f1c-4a8e-9d55-5f2b6c1a7e10';
export const OTHER_SPEC = '6f3c1d2e-8a4b-4c5d-9e6f-7a8b9c0d1e2f';

/** A Specification run ready on `step`. */
export const record = (step: string, specId = SPEC): SpecificationExecutionRecord => ({
  specId,
  archetype: 'feature',
  taskTypes: ['*'],
  run: {
    workflow: { id: 'specification-standard', version: 1, revision: 'a'.repeat(64) },
    position: { state: 'ready', step },
    attempts: [],
    returns: [],
  },
});

/** A `ready` Task drafted by the first breakdown, with only its `task` document. */
export const manifest = (taskId: string, title = taskId): TaskManifest => ({
  id: taskId,
  title,
  type: 'implementation',
  status: 'ready',
  dependsOn: [],
  origin: { kind: 'produced', step: 'breakdown', attempt: 1 },
  documents: [{ ...TASK_MAIN_DOCUMENT }],
});

/** A not-started run record of a Task. */
export const runRecord = (taskId: string, specId = SPEC): TaskRunRecord => ({
  specId,
  taskId,
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

/**
 * The change that creates `manifests` in a store without Tasks: the index lists them, each gets its
 * manifest and initial `task.md`, and, with `runs`, its run record.
 */
export function creating(
  manifests: readonly TaskManifest[],
  options: { readonly runs?: boolean; readonly index?: string | null } = {},
): ExecutionChange {
  return {
    index: {
      expected: options.index ?? null,
      next: { tasks: manifests.map((entry) => ({ id: entry.id })) },
    },
    manifests: manifests.map((next) => ({ taskId: next.id, expected: null, next })),
    documents: manifests.map((next) => ({
      taskId: next.id,
      path: 'task.md',
      text: `# ${next.title}\n`,
    })),
    ...(options.runs === false
      ? {}
      : {
          runs: manifests.map((next) => ({
            taskId: next.id,
            expected: null,
            next: runRecord(next.id),
          })),
        }),
  };
}

export const EMPTY: ExecutionSnapshot = {
  specId: SPEC,
  manifests: [],
  runs: [],
  folders: [],
  issues: [],
};

export function describeWorkflowStoreContract(name: string, create: () => WorkflowStore): void {
  describe(`${name}: workflow store contract`, () => {
    const seeded = async () => {
      const store = create();
      await store.apply(SPEC, {
        specification: { expected: null, next: record('requirements') },
        ...creating([manifest('web'), manifest('api')]),
      });

      return store;
    };

    it('reads back what it applied and accepts writes at the read revision', async () => {
      const store = await seeded();
      const snapshot = await store.read(SPEC);
      expect(snapshot.specification?.value).toEqual(record('requirements'));
      expect(snapshot.index?.value).toEqual({ tasks: [{ id: 'web' }, { id: 'api' }] });
      // Manifests in index order, runs and folders in id order.
      expect(snapshot.manifests.map((entry) => entry.value)).toEqual([
        manifest('web'),
        manifest('api'),
      ]);
      expect(snapshot.runs.map((entry) => entry.value)).toEqual([
        runRecord('api'),
        runRecord('web'),
      ]);
      expect(snapshot.folders).toEqual(['api', 'web']);
      expect(snapshot.issues).toEqual([]);
      expect(await store.read(OTHER_SPEC)).toEqual({ ...EMPTY, specId: OTHER_SPEC });

      await store.apply(SPEC, {
        specification: {
          expected: snapshot.specification?.revision ?? null,
          next: record('solution'),
        },
        manifests: [
          {
            taskId: 'api',
            expected: snapshot.manifests[1]?.revision ?? null,
            next: manifest('api', 'API'),
          },
        ],
      });
      const next = await store.read(SPEC);
      expect(next.specification?.value.run.position).toEqual({ state: 'ready', step: 'solution' });
      expect(next.manifests.map((entry) => entry.value.title)).toEqual(['web', 'API']);
      expect(next.runs).toEqual(snapshot.runs);
    });

    it('refuses writes planned against another revision and writes nothing', async () => {
      const store = await seeded();
      const before = await store.read(SPEC);

      for (const change of [
        { specification: { expected: null, next: record('solution') } },
        { index: { expected: 'f'.repeat(64), next: { tasks: [] } } },
        {
          manifests: [
            {
              taskId: 'web',
              expected: before.manifests[0]?.revision ?? null,
              next: manifest('web', 'x'),
            },
            { taskId: 'api', expected: 'f'.repeat(64), next: manifest('api', 'y') },
          ],
        },
        { runs: [{ taskId: 'api', expected: null, next: runRecord('api') }] },
      ] satisfies ExecutionChange[]) {
        await expect(store.apply(SPEC, change)).rejects.toMatchObject({
          code: 'WORKFLOW_STATE_CONFLICT',
        });
      }

      expect(await store.read(SPEC)).toEqual(before);
    });

    const draftWithRun = (): ExecutionChange => {
      const change = creating([{ ...manifest('api'), status: 'draft' }]);
      const run = runRecord('api');

      return {
        ...change,
        runs: [
          {
            taskId: 'api',
            expected: null,
            next: {
              ...run,
              run: {
                ...run.run,
                position: { state: 'ready', step: 'implement' },
                attempts: [{ ...endedAttempt(1), step: 'implement' }],
              },
            },
          },
        ],
      };
    };

    it.each<[string, () => ExecutionChange]>([
      [
        'a valid Specification next to a Task over the title limit',
        () => ({
          specification: { expected: null, next: record('requirements') },
          ...creating([manifest('api', 'x'.repeat(201))]),
        }),
      ],
      [
        'a Task with an unknown status',
        () => creating([{ ...manifest('api'), status: 'blocked' } as unknown as TaskManifest]),
      ],
      [
        'a Task manifest without its task document',
        () =>
          creating([
            { ...manifest('api'), documents: [{ id: 'notes', path: 'notes.md', type: 'note' }] },
          ]),
      ],
      [
        'a manifest write naming another Task',
        () => ({
          ...creating([manifest('api')]),
          manifests: [{ taskId: 'api', expected: null, next: manifest('web') }],
        }),
      ],
      [
        'a run write naming another Task',
        () => ({
          ...creating([manifest('api')]),
          runs: [{ taskId: 'api', expected: null, next: runRecord('web') }],
        }),
      ],
      [
        'a Task run of another Specification',
        () => ({
          ...creating([manifest('api')]),
          runs: [{ taskId: 'api', expected: null, next: runRecord('api', OTHER_SPEC) }],
        }),
      ],
      [
        'a Specification record of another Specification',
        () => ({ specification: { expected: null, next: record('requirements', OTHER_SPEC) } }),
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
        }),
      ],
      [
        'a run record of a Task that is not registered',
        () => ({ runs: [{ taskId: 'api', expected: null, next: runRecord('api') }] }),
      ],
      [
        'a Task folder the index does not list',
        () => ({ ...creating([manifest('api')]), index: { expected: null, next: { tasks: [] } } }),
      ],
      [
        'an index entry without its manifest',
        () => ({ index: { expected: null, next: { tasks: [{ id: 'api' }] } } }),
      ],
      [
        'a dependency on a Task that is not registered',
        () => creating([{ ...manifest('api'), dependsOn: ['web'] }]),
      ],
      [
        'a dependency cycle',
        () =>
          creating([
            { ...manifest('api'), dependsOn: ['web'] },
            { ...manifest('web'), dependsOn: ['api'] },
          ]),
      ],
      ['a draft that ran', draftWithRun],
      [
        'a document path outside the Task folder',
        () => ({
          ...creating([manifest('api')]),
          documents: [{ taskId: 'api', path: '../overview.md', text: 'x' }],
        }),
      ],
    ])('writes nothing for %s', async (_name, change) => {
      const store = create();

      await expect(store.apply(SPEC, change())).rejects.toMatchObject({
        code: 'WORKFLOW_STATE_CORRUPT',
      });
      expect(await store.read(SPEC)).toEqual(EMPTY);
    });

    it('lists the files of a Task folder and removes the whole folder with the Task', async () => {
      const store = create();
      const api: TaskManifest = {
        ...manifest('api'),
        documents: [{ ...TASK_MAIN_DOCUMENT }, { id: 'notes', path: 'notes/a.md', type: 'note' }],
      };
      const created = creating([api], { runs: false });
      await store.apply(SPEC, {
        ...created,
        documents: [...(created.documents ?? []), { taskId: 'api', path: 'notes/a.md', text: 'x' }],
      });

      expect(await store.taskFiles(SPEC, 'api')).toEqual(['notes/a.md', 'task.md', 'task.yaml']);
      const snapshot = await store.read(SPEC);
      await store.apply(SPEC, {
        index: { expected: snapshot.index?.revision ?? null, next: { tasks: [] } },
        manifests: [
          { taskId: 'api', expected: snapshot.manifests[0]?.revision ?? null, next: null },
        ],
        documents: [
          { taskId: 'api', path: 'task.md', text: null },
          { taskId: 'api', path: 'notes/a.md', text: null },
        ],
      });

      expect(await store.taskFiles(SPEC, 'api')).toEqual([]);
      expect(await store.read(SPEC)).toMatchObject({ manifests: [], folders: [], issues: [] });
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
      };

      await expect(store.apply(SPEC, change)).rejects.toMatchObject({
        code: 'WORKFLOW_INPUT_INVALID',
      });
      expect(await store.read(SPEC)).toEqual(EMPTY);
    });

    it('keeps a Task status with its last change, its origin and its context', async () => {
      const store = create();
      const held: TaskManifest = {
        ...manifest('api'),
        status: 'on-hold',
        statusChange: { source: 'escalation', at: '2026-11-05T10:00:00.000Z', reason: 'Unclear.' },
        origin: { kind: 'manual', actorId: 'local:owner' },
        context: [
          { kind: 'specification-document', id: 'overview', required: true },
          { kind: 'path', path: 'packages/**/*.ts', required: false, note: 'Code.' },
        ],
      };
      await store.apply(SPEC, creating([held, { ...manifest('web'), status: 'draft' }]));

      expect((await store.read(SPEC)).manifests.map((entry) => entry.value)).toEqual([
        held,
        { ...manifest('web'), status: 'draft' },
      ]);
    });

    it('creates a Task without a run and removes it with its folder as one change', async () => {
      const store = create();
      await store.apply(SPEC, creating([manifest('api'), manifest('web')], { runs: false }));
      const created = await store.read(SPEC);
      expect(created.runs).toEqual([]);
      expect(created.folders).toEqual(['api', 'web']);
      expect(created.issues).toEqual([]);

      // Removing only the index entry would leave an unregistered folder: refused.
      await expect(
        store.apply(SPEC, {
          index: { expected: created.index?.revision ?? null, next: { tasks: [{ id: 'web' }] } },
        }),
      ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });

      await store.apply(SPEC, {
        index: { expected: created.index?.revision ?? null, next: { tasks: [{ id: 'web' }] } },
        manifests: [
          { taskId: 'api', expected: created.manifests[0]?.revision ?? null, next: null },
        ],
        documents: [{ taskId: 'api', path: 'task.md', text: null }],
      });
      const removed = await store.read(SPEC);
      expect(removed.manifests.map((entry) => entry.value.id)).toEqual(['web']);
      expect(removed.folders).toEqual(['web']);
      expect(removed.issues).toEqual([]);
    });

    it('refuses to create a Task document over a file the folder holds already', async () => {
      const store = await seeded();
      const before = await store.read(SPEC);

      await expect(
        store.apply(SPEC, { documents: [{ taskId: 'api', path: 'task.md', text: '# Again\n' }] }),
      ).rejects.toMatchObject({
        code: 'WORKFLOW_STATE_CORRUPT',
        message: expect.stringContaining('task.md') as unknown,
      });
      expect(await store.read(SPEC)).toEqual(before);
    });

    it('applies an empty change as nothing', async () => {
      const store = await seeded();
      const before = await store.read(SPEC);
      await store.apply(SPEC, {});
      expect(await store.read(SPEC)).toEqual(before);
    });
  });
}
