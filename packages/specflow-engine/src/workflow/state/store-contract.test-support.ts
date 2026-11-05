import { describe, expect, it } from 'vitest';

import type { AttentionItem } from '../attention/model';
import { FEEDBACK_MAX } from '../limits';
import type { AttemptRecord, SpecificationExecutionRecord, TaskRecord } from './model';
import type { ExecutionChange, WorkflowStore } from './store';

/**
 * The behaviour every {@link WorkflowStore} shares, run against the memory store and the filesystem
 * store so the operations' tests (memory) and production (filesystem) see the same contract.
 */

export const SPEC = '0b9d2f9e-4f1c-4a8e-9d55-5f2b6c1a7e10';
export const OTHER_SPEC = '6f3c1d2e-8a4b-4c5d-9e6f-7a8b9c0d1e2f';
export const noAttention = { set: [], clear: [] };

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

export const task = (taskId: string, title = taskId, specId = SPEC): TaskRecord => ({
  specId,
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

export const attention = (
  subject: AttentionItem['subject'],
  step = 'requirements',
): AttentionItem => ({
  subject,
  step,
  reason: 'owner-action',
  createdAt: '2026-11-05T10:00:00.000Z',
});

const specSubject = { kind: 'specification', specId: SPEC } as const;
const taskSubject = (taskId: string) => ({ kind: 'task', specId: SPEC, taskId }) as const;

export function describeWorkflowStoreContract(name: string, create: () => WorkflowStore): void {
  describe(`${name}: workflow store contract`, () => {
    const seeded = async () => {
      const store = create();
      await store.apply(SPEC, {
        specification: { expected: null, next: record('requirements') },
        tasks: [
          { taskId: 'web', expected: null, next: task('web') },
          { taskId: 'api', expected: null, next: task('api') },
        ],
        attention: noAttention,
      });

      return store;
    };

    it('reads back what it applied, Tasks in id order, and accepts writes at the read revision', async () => {
      const store = await seeded();
      const snapshot = await store.read(SPEC);
      expect(snapshot.specification?.value).toEqual(record('requirements'));
      expect(snapshot.tasks.map((entry) => entry.value.taskId)).toEqual(['api', 'web']);
      expect(await store.read(OTHER_SPEC)).toEqual({ tasks: [], attention: [] });

      await store.apply(SPEC, {
        specification: {
          expected: snapshot.specification?.revision ?? null,
          next: record('solution'),
        },
        tasks: [
          {
            taskId: 'api',
            expected: snapshot.tasks[0]?.revision ?? null,
            next: task('api', 'API'),
          },
        ],
        attention: noAttention,
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
          attention: noAttention,
        },
        {
          tasks: [
            { taskId: 'api', expected: before.tasks[0]?.revision ?? null, next: task('api', 'x') },
            { taskId: 'web', expected: 'f'.repeat(64), next: task('web', 'y') },
          ],
          attention: noAttention,
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
          specification: { expected: null, next: record('requirements') },
          tasks: [{ taskId: 'api', expected: null, next: task('api', 'x'.repeat(201)) }],
          attention: noAttention,
        }),
      ],
      [
        'a Task write naming another Task',
        () => ({
          tasks: [{ taskId: 'api', expected: null, next: task('web') }],
          attention: noAttention,
        }),
      ],
      [
        'a Task of another Specification',
        () => ({
          tasks: [{ taskId: 'api', expected: null, next: task('api', 'api', OTHER_SPEC) }],
          attention: noAttention,
        }),
      ],
      [
        'a Specification record of another Specification',
        () => ({
          specification: { expected: null, next: record('requirements', OTHER_SPEC) },
          tasks: [],
          attention: noAttention,
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
          attention: noAttention,
        }),
      ],
      [
        'attention for a Task that does not exist',
        () => ({
          specification: { expected: null, next: record('requirements') },
          tasks: [],
          attention: { set: [attention(taskSubject('ghost'))], clear: [] },
        }),
      ],
      [
        'attention for another Specification',
        () => ({
          specification: { expected: null, next: record('requirements') },
          tasks: [],
          attention: { set: [attention({ kind: 'specification', specId: OTHER_SPEC })], clear: [] },
        }),
      ],
    ])('writes nothing for %s', async (_name, change) => {
      const store = create();

      await expect(store.apply(SPEC, change())).rejects.toMatchObject({
        code: 'WORKFLOW_STATE_CORRUPT',
      });
      expect(await store.read(SPEC)).toEqual({ tasks: [], attention: [] });
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
        attention: noAttention,
      };

      await expect(store.apply(SPEC, change)).rejects.toMatchObject({
        code: 'WORKFLOW_INPUT_INVALID',
      });
      expect(await store.read(SPEC)).toEqual({ tasks: [], attention: [] });
    });

    it('keeps one attention item per subject: set replaces, clear removes', async () => {
      const store = await seeded();
      await store.apply(SPEC, {
        tasks: [],
        attention: { set: [attention(specSubject), attention(taskSubject('api'))], clear: [] },
      });
      await store.apply(SPEC, {
        tasks: [],
        attention: { set: [attention(specSubject, 'solution')], clear: ['task:' + SPEC + ':api'] },
      });

      expect((await store.read(SPEC)).attention).toEqual([attention(specSubject, 'solution')]);
    });
  });
}
