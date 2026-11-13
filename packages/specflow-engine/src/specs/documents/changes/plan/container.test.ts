import { describe, expect, it } from 'vitest';

import { parseTaskManifest, serializeTaskManifest } from '../../../../tasks/resource/codec';
import type { TaskManifest } from '../../../../tasks/resource/model';
import { TEST_SLUG, TEST_SPEC_ID, buildSnapshot, observed } from '../test-support';
import { decodePlan, encodePlan } from './codec';
import {
  SPECIFICATION_CONTAINER,
  containerDirectory,
  isRequiredDocument,
  isReservedContainerPath,
  registryFileOf,
} from './container';
import { planDocumentChange } from './index';
import { containerOfPlan, manifestPathOf } from './model';
import type { DocumentChangeRequest } from './request';
import type { PlanningSnapshot } from './snapshot';

const TASK = { kind: 'task', taskId: 'local-store' } as const;
const TASK_DIRECTORY = `specs/active/${TEST_SLUG}/tasks/local-store`;

const taskManifest = (): TaskManifest => ({
  id: 'local-store',
  title: 'Local store',
  type: 'implementation',
  status: 'draft',
  dependsOn: [],
  origin: { kind: 'manual', actorId: 'local:me' },
  documents: [
    { id: 'task', path: 'task.md', type: 'task' },
    { id: 'notes', path: 'notes.md', type: 'note' },
    { id: 'plan', path: 'plan.md', type: 'note' },
  ],
  context: [{ kind: 'task-document', id: 'plan', required: true }],
});

function taskSnapshot(): PlanningSnapshot {
  const manifest = taskManifest();

  return {
    container: TASK,
    manifest: {
      specId: TEST_SPEC_ID,
      slug: TEST_SLUG,
      location: 'active',
      documents: manifest.documents,
      folders: [],
    },
    manifestText: serializeTaskManifest(manifest),
    files: [
      observed('task.md', '# Local store\n'),
      observed('notes.md', 'notes\n'),
      observed('plan.md', 'plan\n'),
    ],
  };
}

const revisionOf = (snapshot: PlanningSnapshot, path: string): string =>
  snapshot.files.find((file) => file.path === path)!.revision;

const plan = (request: DocumentChangeRequest, snapshot = taskSnapshot()) =>
  planDocumentChange(snapshot, request).plan;

describe('document containers', () => {
  it('resolve to their own root folder and registry file', () => {
    expect(containerDirectory(TEST_SLUG, SPECIFICATION_CONTAINER)).toBe(
      `specs/active/${TEST_SLUG}`,
    );
    expect(registryFileOf(SPECIFICATION_CONTAINER)).toBe('specification.yaml');
    expect(containerDirectory(TEST_SLUG, TASK)).toBe(TASK_DIRECTORY);
    expect(registryFileOf(TASK)).toBe('task.yaml');
    expect(manifestPathOf({ directory: TASK_DIRECTORY, taskId: 'local-store' })).toBe(
      `${TASK_DIRECTORY}/task.yaml`,
    );
    expect(containerOfPlan({})).toEqual(SPECIFICATION_CONTAINER);
    expect(containerOfPlan({ taskId: 'local-store' })).toEqual(TASK);
  });

  it('reserve the registry file of a Task besides the Specification names', () => {
    expect(isReservedContainerPath(TASK, 'task.yaml')).toBe(true);
    expect(isReservedContainerPath(TASK, 'Task.YAML')).toBe(true);
    expect(isReservedContainerPath(TASK, 'specification.yaml')).toBe(true);
    expect(isReservedContainerPath(SPECIFICATION_CONTAINER, 'task.yaml')).toBe(false);
    expect(isReservedContainerPath(TASK, 'task.md')).toBe(false);
  });

  it('name one required document each', () => {
    expect(isRequiredDocument(SPECIFICATION_CONTAINER, { id: 'overview' })).toBe(true);
    expect(isRequiredDocument(SPECIFICATION_CONTAINER, { id: 'task', path: 'task.md' })).toBe(
      false,
    );
    expect(isRequiredDocument(TASK, { id: 'task' })).toBe(true);
    expect(isRequiredDocument(TASK, { id: 'other', path: 'TASK.md' })).toBe(true);
    expect(isRequiredDocument(TASK, { id: 'overview', path: 'overview.md' })).toBe(false);
  });
});

describe('planning in a Task container', () => {
  it('saves task.md against its revision, below the Task folder, without touching task.yaml', () => {
    const snapshot = taskSnapshot();
    const result = plan(
      {
        action: 'save',
        documentId: 'task',
        content: '# Local store\n\nMore.\n',
        expectedRevision: revisionOf(snapshot, 'task.md'),
      },
      snapshot,
    );

    expect(result).toMatchObject({ taskId: 'local-store', directory: TASK_DIRECTORY });
    expect(result.paths.map((path) => path.path)).toEqual([`${TASK_DIRECTORY}/task.md`]);
    expect(decodePlan(encodePlan(result).text)).toEqual(result);
    expect(() =>
      plan({ action: 'save', documentId: 'task', content: 'x', expectedRevision: 'stale' }),
    ).toThrow(expect.objectContaining({ code: 'DOCUMENT_REVISION_CONFLICT' }));
  });

  it('refuses to delete or rename the task document', () => {
    const snapshot = taskSnapshot();
    const expectedRevision = revisionOf(snapshot, 'task.md');
    const target = { kind: 'document', documentId: 'task' } as const;

    expect(() => plan({ action: 'delete', target, expectedRevision }, snapshot)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_PROTECTED' }),
    );
    expect(() =>
      plan({ action: 'rename', target, name: 'brief.md', expectedRevision }, snapshot),
    ).toThrow(expect.objectContaining({ code: 'DOCUMENT_PROTECTED' }));
  });

  it('creates a typed document by rewriting task.yaml with the strict Task parser', () => {
    const result = plan({
      action: 'create',
      documents: [{ path: 'research.md', content: '# Research\n', type: 'note' }],
      folders: [],
    });
    const manifest = result.paths.at(-1)!;

    expect(manifest).toMatchObject({ path: `${TASK_DIRECTORY}/task.yaml`, role: 'manifest' });
    expect(result.registry?.documents.map((document) => document.path)).toEqual([
      'task.md',
      'notes.md',
      'plan.md',
      'research.md',
    ]);
    expect(decodePlan(encodePlan(result).text)).toEqual(result);
  });

  it('renames and deletes other documents and keeps the rest of task.yaml', () => {
    const snapshot = taskSnapshot();
    const renamed = planDocumentChange(snapshot, {
      action: 'rename',
      target: { kind: 'document', documentId: 'notes' },
      name: 'findings.md',
      expectedRevision: revisionOf(snapshot, 'notes.md'),
    });
    const text = renamed.payloads.find(
      (payload) => payload.sha256 === renamed.plan.paths.at(-1)!.post!.sha256,
    )!.content;

    expect(parseTaskManifest(text, 'local-store')).toEqual({
      ...taskManifest(),
      documents: [
        { id: 'task', path: 'task.md', type: 'task' },
        { id: 'notes', path: 'findings.md', type: 'note' },
        { id: 'plan', path: 'plan.md', type: 'note' },
      ],
    });
    expect(
      plan(
        {
          action: 'delete',
          target: { kind: 'document', documentId: 'notes' },
          expectedRevision: revisionOf(snapshot, 'notes.md'),
        },
        snapshot,
      ).removedDocumentIds,
    ).toEqual(['notes']);
  });

  it.each<[string, DocumentChangeRequest, string]>([
    [
      'a second task type',
      { action: 'create', documents: [{ path: 'b.md', content: 'b', type: 'task' }], folders: [] },
      'DOCUMENT_OPERATION_INVALID',
    ],
    [
      'an unclassified document',
      { action: 'create', documents: [{ path: 'b.md', content: 'b' }], folders: [] },
      'DOCUMENT_TYPE_INVALID',
    ],
    [
      'a document in a folder',
      {
        action: 'create',
        documents: [{ path: 'a/b.md', content: 'b', type: 'note' }],
        folders: [],
      },
      'DOCUMENT_PATH_INVALID',
    ],
    [
      'the registry file',
      {
        action: 'create',
        documents: [{ path: 'task.yaml', content: 'b', type: 'note' }],
        folders: [],
      },
      'DOCUMENT_PATH_INVALID',
    ],
    ['a folder', { action: 'folder', path: 'research' }, 'DOCUMENT_OPERATION_INVALID'],
    [
      'a move',
      {
        action: 'move',
        target: { kind: 'document', documentId: 'notes' },
        targetFolder: 'x',
        expectedRevision: 'r',
      },
      'DOCUMENT_OPERATION_INVALID',
    ],
    [
      'a classification',
      { action: 'classify', documentId: 'u-1', type: 'note', expectedRevision: 'r' },
      'DOCUMENT_OPERATION_INVALID',
    ],
  ])('refuses %s', (_name, request, code) => {
    expect(() => plan(request)).toThrow(expect.objectContaining({ code }));
  });

  it('refuses to delete a document the Task context names', () => {
    const snapshot = taskSnapshot();

    expect(() =>
      plan(
        {
          action: 'delete',
          target: { kind: 'document', documentId: 'plan' },
          expectedRevision: revisionOf(snapshot, 'plan.md'),
        },
        snapshot,
      ),
    ).toThrow(expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }));
  });

  it('keeps the Specification plans as they were', () => {
    const snapshot = buildSnapshot();
    const result = planDocumentChange(snapshot, {
      action: 'save',
      documentId: 'overview',
      content: 'x\n',
      expectedRevision: revisionOf(snapshot, 'overview.md'),
    }).plan;

    expect(result.taskId).toBeUndefined();
    expect(encodePlan(result).text).not.toContain('taskId');
  });

  it('refuses a stored Task plan whose directory is not its Task folder', () => {
    const result = plan({
      action: 'create',
      documents: [{ path: 'r.md', content: 'r', type: 'note' }],
      folders: [],
    });
    const forged = JSON.stringify({ ...JSON.parse(encodePlan(result).text), taskId: 'other' });

    expect(() => decodePlan(forged)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_RECOVERY_REQUIRED' }),
    );
  });
});
