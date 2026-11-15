import { describe, expect, it } from 'vitest';

import type { TaskManifest } from './model';
import {
  validateTaskContext,
  validateTaskResources,
  type TaskResourceState,
  type TaskRunSummary,
} from './validate';

const manifest = (id: string, extra: Partial<TaskManifest> = {}): TaskManifest => ({
  id,
  title: id,
  type: 'implementation',
  status: 'ready',
  dependsOn: [],
  origin: { kind: 'manual', actorId: 'local:owner' },
  documents: [{ id: 'task', path: 'task.md', type: 'task' }],
  ...extra,
});

const state = (
  manifests: readonly TaskManifest[],
  extra: Partial<TaskResourceState> = {},
): TaskResourceState => ({
  index: manifests.map((entry) => entry.id),
  manifests: new Map(manifests.map((entry) => [entry.id, entry])),
  folders: manifests.map((entry) => entry.id),
  runs: [],
  ...extra,
});

const run = (taskId: string, extra: Partial<TaskRunSummary> = {}): TaskRunSummary => ({
  taskId,
  state: 'not-started',
  attempts: 0,
  ...extra,
});

describe('validateTaskResources', () => {
  it('accepts consistent Tasks, with and without runs', () => {
    expect(
      validateTaskResources(
        state([manifest('api'), manifest('web', { dependsOn: ['api'] })], { runs: [run('api')] }),
      ),
    ).toEqual([]);
  });

  it.each<[string, TaskResourceState, unknown[]]>([
    [
      'an index entry without its folder',
      state([manifest('api')], { index: ['api', 'web'] }),
      [{ kind: 'dangling', taskId: 'web', reason: 'missing-folder' }],
    ],
    [
      'an index entry whose folder has no manifest',
      state([manifest('api')], { index: ['api', 'web'], folders: ['api', 'web'] }),
      [{ kind: 'dangling', taskId: 'web', reason: 'missing-manifest' }],
    ],
    [
      'a folder the index does not list',
      state([manifest('api')], { folders: ['api', 'stray'] }),
      [{ kind: 'unregistered', taskId: 'stray' }],
    ],
    [
      'a run whose Task is gone',
      state([manifest('api')], { runs: [run('gone')] }),
      [{ kind: 'broken', taskId: 'gone', reason: 'unregistered-run' }],
    ],
    [
      'a draft that ran',
      state([manifest('api', { status: 'draft' })], {
        runs: [run('api', { state: 'ready', attempts: 1 })],
      }),
      [{ kind: 'broken', taskId: 'api', reason: 'draft-with-run' }],
    ],
    [
      'a cancelled Task with an active step',
      state([manifest('api', { status: 'cancelled' })], {
        runs: [run('api', { state: 'active', attempts: 1 })],
      }),
      [{ kind: 'broken', taskId: 'api', reason: 'cancelled-while-active' }],
    ],
    [
      'a dependency on an unknown Task',
      state([manifest('api', { dependsOn: ['ghost'] })]),
      [{ kind: 'dependency', taskId: 'api', dependency: 'ghost', reason: 'unknown' }],
    ],
    [
      'a dependency on a dangling Task',
      state([manifest('api', { dependsOn: ['web'] })], { index: ['api', 'web'] }),
      [
        { kind: 'dangling', taskId: 'web', reason: 'missing-folder' },
        { kind: 'dependency', taskId: 'api', dependency: 'web', reason: 'dangling' },
      ],
    ],
    [
      'a dependency cycle',
      state([manifest('api', { dependsOn: ['web'] }), manifest('web', { dependsOn: ['api'] })]),
      [
        { kind: 'cycle', taskId: 'api' },
        { kind: 'cycle', taskId: 'web' },
      ],
    ],
    [
      'two cycles and a Task that only depends on one',
      state([
        manifest('api', { dependsOn: ['web'] }),
        manifest('web', { dependsOn: ['api'] }),
        manifest('c', { dependsOn: ['d'] }),
        manifest('d', { dependsOn: ['c'] }),
        manifest('e', { dependsOn: ['c'] }),
      ]),
      ['api', 'c', 'd', 'web'].map((taskId) => ({ kind: 'cycle', taskId })),
    ],
  ])('reports %s', (_name, input, issues) => {
    expect(validateTaskResources(input)).toEqual(issues);
  });
});

describe('validateTaskContext', () => {
  const lookup = {
    specificationDocument: (id: string) => id === 'overview',
    projectDocument: (id: string) => id === 'architecture.workflow.workflow-kernel',
    path: (path: string) => path.startsWith('packages/'),
  };

  it('resolves every kind and reports the missing references in list order', () => {
    const context: TaskManifest['context'] = [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'task-document', id: 'notes', required: false },
      { kind: 'specification-document', id: 'overview', required: true },
      { kind: 'specification-document', id: 'design', required: true },
      { kind: 'project-document', id: 'architecture.workflow.workflow-kernel', required: true },
      { kind: 'project-document', id: 'gone', required: false },
      { kind: 'path', path: 'packages/**/*.ts', required: true },
      { kind: 'path', path: 'docs/missing.md', required: true },
      { kind: 'instructions', text: 'Always resolves.', required: true },
    ];

    expect(
      validateTaskContext(manifest('api', { context }), lookup).map(({ index, reason }) => [
        index,
        reason,
      ]),
    ).toEqual([
      [1, 'not-registered'],
      [3, 'not-found'],
      [5, 'not-found'],
      [7, 'not-found'],
    ]);
  });

  it('has nothing to check without an explicit context', () => {
    expect(validateTaskContext(manifest('api'), lookup)).toEqual([]);
  });
});
