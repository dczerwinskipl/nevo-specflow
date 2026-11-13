// Integration (real project, real Git, real files): the documents of a Task (T5) go through the
// documents writer — revision check, journal, commit queue — and are refused while the Specification
// execution store holds a pending change of that Task (D03), which in turn sees the pending
// document change.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import {
  applyTaskDocumentChange,
  hasPendingTaskDocumentChange,
} from '../../src/specs/documents/api';
import { flushDocumentCommits } from '../../src/specs/documents/queue/flush';
import { readTaskDocuments } from '../../src/specs/documents/task-document-reader';
import { openWorkflow, setTaskStatus } from '../../src/workflow';
import {
  initialTaskDocument,
  parseTaskManifest,
  serializeTaskIndex,
  serializeTaskManifest,
} from '../../src/tasks/resource/codec';
import type { TaskManifest } from '../../src/tasks/resource/model';
import { pendingJournal, serializeJournal } from '../../src/workflow/state/journal';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import { noSleep, writableProject } from '../support/document-writes';
import { commitStaged, git } from '../support/git-project';
import { useSlowGitTestTimeouts } from '../support/platform';

useSlowGitTestTimeouts();

afterEach(removeTrackedRoots);

const brief: TaskManifest = {
  id: 'brief',
  title: 'Write the brief',
  type: 'implementation',
  status: 'draft',
  dependsOn: [],
  origin: { kind: 'manual', actorId: 'local:me' },
  documents: [{ id: 'task', path: 'task.md', type: 'task' }],
};

describe('workflow state commits (auto-commit on)', () => {
  it('commits a workflow change alone, and together with a queued change of the same task.yaml', async () => {
    const project = await writableProject({ git: true, notes: 1 });
    const taskDir = join(project.dir, 'tasks', 'brief');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      join(project.dir, 'tasks', 'index.yaml'),
      serializeTaskIndex({ tasks: [brief] }),
    );
    await writeFile(
      join(taskDir, 'task.yaml'),
      serializeTaskManifest({ ...brief, status: 'ready' }),
    );
    await writeFile(join(taskDir, 'task.md'), initialTaskDocument(brief));
    git(project.root, 'add', 'specs');
    commitStaged(project.root, 'task');
    const checkout = { workspaceId: project.workspaceId, root: project.root };
    const status = async (next: 'on-hold' | 'ready') =>
      setTaskStatus(await openWorkflow(project.engine), {
        specId: project.specId,
        taskId: 'brief',
        status: next,
        actor: { class: 'human', details: { actorId: 'owner', trust: 'local' } },
      });
    const slug = project.dir.split(/[\\/]/u).at(-1)!;
    const directory = `specs/active/${slug}`;
    const head = () => git(project.root, 'rev-parse', 'HEAD');

    // One workflow change: queued through the document queue, one commit with exactly its path.
    const before = head();
    await status('on-hold');
    await flushDocumentCommits(project.engine, checkout);
    expect(git(project.root, 'rev-list', '--count', `${before}..HEAD`)).toBe('1');
    expect(git(project.root, 'log', '-1', '--format=%s')).toBe(
      `spec(workflow): set task brief on-hold in ${slug}`,
    );
    expect(git(project.root, 'log', '-1', '--format=%(trailers:key=Nevo-Action,valueonly)')).toBe(
      'workflow',
    );
    expect(git(project.root, 'show', '--name-only', '--format=', 'HEAD')).toBe(
      `${directory}/tasks/brief/task.yaml`,
    );
    expect(git(project.root, 'status', '--porcelain')).toBe('');

    // A Task document change of the same task.yaml queues after the workflow change and plans from
    // the file the store wrote: the batch keeps the first pre and the last post, and commits clean.
    const resumed = head();
    await status('ready');
    await applyTaskDocumentChange(
      project.engine,
      project.specId,
      'brief',
      randomUUID(),
      {
        action: 'create',
        documents: [{ path: 'research.md', content: '# Research\n', type: 'note' }],
        folders: [],
      },
      { sleep: noSleep },
    );
    const flushed = await flushDocumentCommits(project.engine, checkout);
    expect(flushed.remaining).toBeUndefined();
    expect(git(project.root, 'status', '--porcelain')).toBe('');
    expect(git(project.root, 'diff', '--name-only', resumed, 'HEAD').split('\n').sort()).toEqual([
      `${directory}/tasks/brief/research.md`,
      `${directory}/tasks/brief/task.yaml`,
    ]);
    expect(
      parseTaskManifest(await readFile(join(taskDir, 'task.yaml'), 'utf8'), 'brief'),
    ).toMatchObject({ status: 'ready', documents: [...brief.documents, { id: 'note' }] });
  });
});

describe('Task documents', () => {
  it('save task.md against its revision and are refused while a Task resource change is pending', async () => {
    const project = await writableProject({ git: true, notes: 1 });
    const taskDir = join(project.dir, 'tasks', 'brief');
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      join(project.dir, 'tasks', 'index.yaml'),
      serializeTaskIndex({ tasks: [brief] }),
    );
    await writeFile(join(taskDir, 'task.yaml'), serializeTaskManifest(brief));
    await writeFile(join(taskDir, 'task.md'), initialTaskDocument(brief));
    git(project.root, 'add', 'specs');
    commitStaged(project.root, 'task');
    // task.yaml may be uncommitted (the store's writes with auto-commit off, or not committed yet).
    await writeFile(
      join(taskDir, 'task.yaml'),
      serializeTaskManifest({ ...brief, status: 'ready' }),
    );

    const listed = await readTaskDocuments(project.engine, project.specId, 'brief');
    const taskMd = listed.documents.find((document) => document.id === 'task');
    expect(taskMd).toMatchObject({ path: 'task.md', required: true, file: { editable: true } });
    const save = (expectedRevision: string, content: string) =>
      applyTaskDocumentChange(
        project.engine,
        project.specId,
        'brief',
        randomUUID(),
        { action: 'save', documentId: 'task', content, expectedRevision },
        { sleep: noSleep },
      );

    expect(await failure(save('0'.repeat(64), 'stale\n'))).toMatchObject({
      code: 'DOCUMENT_REVISION_CONFLICT',
    });
    const saved = await save(taskMd!.file!.revision, '# Write the brief\n\nIn detail.\n');
    expect(saved).toMatchObject({ taskId: 'brief', action: 'save', stage: 'queued' });
    expect(await readFile(join(taskDir, 'task.md'), 'utf8')).toBe(
      '# Write the brief\n\nIn detail.\n',
    );

    // A registry change rewrites task.yaml through the strict Task parser and keeps the rest of it.
    const created = await applyTaskDocumentChange(
      project.engine,
      project.specId,
      'brief',
      randomUUID(),
      {
        action: 'create',
        documents: [{ path: 'research.md', content: '# Research\n', type: 'note' }],
        folders: [],
      },
      { sleep: noSleep },
    );
    expect(created.allocatedIds).toEqual(['note']);
    expect(parseTaskManifest(await readFile(join(taskDir, 'task.yaml'), 'utf8'), 'brief')).toEqual({
      ...brief,
      status: 'ready',
      documents: [...brief.documents, { id: 'note', path: 'research.md', type: 'note' }],
    });

    // D03, store side: the uncommitted document changes of this Task are pending; another Task's are not.
    const context = project.engine.context;
    expect(await hasPendingTaskDocumentChange(context, project.specId, 'brief')).toBe(true);
    expect(await hasPendingTaskDocumentChange(context, project.specId, 'other')).toBe(false);
    // ... and the store refuses to write the Task's files until they are committed.
    const hold = async () =>
      setTaskStatus(await openWorkflow(project.engine), {
        specId: project.specId,
        taskId: 'brief',
        status: 'on-hold',
        actor: { class: 'human', details: { actorId: 'owner', trust: 'local' } },
      });
    expect(await failure(hold())).toMatchObject({ code: 'WORKFLOW_TASK_BUSY' });
    await flushDocumentCommits(project.engine, {
      workspaceId: project.workspaceId,
      root: project.root,
    });
    expect(await hasPendingTaskDocumentChange(context, project.specId, 'brief')).toBe(false);
    await expect(hold()).resolves.toMatchObject({ status: 'on-hold' });

    // D03, documents side: a pending execution-store change of the Task (left by a crash) refuses.
    const manifestText = await readFile(join(taskDir, 'task.yaml'), 'utf8');
    const journalDir = join(context.project.stateRoot, 'engine', 'operations', 'workflow');
    await mkdir(journalDir, { recursive: true });
    await writeFile(
      join(journalDir, `${project.specId}.json`),
      serializeJournal(
        pendingJournal(project.specId, [
          {
            target: 'task-manifest',
            taskId: 'brief',
            text: serializeTaskManifest({ ...brief, status: 'on-hold' }),
            expected: sha256Hex(manifestText),
          },
        ]),
      ),
    );
    const current = (await readTaskDocuments(project.engine, project.specId, 'brief')).documents[0];
    expect(await failure(save(current!.file!.revision, 'blocked\n'))).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'task-resource-change' },
    });
    expect(await readFile(join(taskDir, 'task.md'), 'utf8')).toBe(
      '# Write the brief\n\nIn detail.\n',
    );
  });
});
