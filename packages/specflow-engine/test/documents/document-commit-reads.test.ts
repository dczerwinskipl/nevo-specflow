// Integration (real project, real Git, real journals made by the writer and the queue): what the
// reads report of the document commits. The tree marker and summary, the real action availability,
// the status of one operation and the rows of the document operation list, in every state a commit can
// be in; and what a read does not do (take the control lock, start Git, write, depend on the clock).
import { randomUUID } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DocumentTreeSchema } from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { GitCapabilityError } from '../../src/git/errors';
import { withProjectControlLock } from '../../src/testing';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../src/specs/documents/changes/journal/kind';
import { buildJournal } from '../../src/specs/documents/changes/test-support';
import { encodePlan } from '../../src/specs/documents/changes/plan/codec';
import type { DocumentChangePlan } from '../../src/specs/documents/changes/plan/model';
import {
  abandonDocumentCommit,
  recoverDocumentOperation,
} from '../../src/specs/documents/queue/actions';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import {
  DOCUMENT_ROW_PENDING_AFTER_MS,
  listDocumentOperationRows,
  readDocumentOperationStatus,
  readRegisteredDocumentSummaries,
  readSpecificationDocumentTree,
} from '../../src/specs/documents/reading';
import { clearCommitReadMemo, readDocumentCommitView } from '../../src/specs/documents/reads';
import type { ProcessTable } from '../../src/specs/documents/write/executor-identity';
import { publishJournal, withJournalLock, writePayload } from '../../src/specs/durable';
import { openVersionControl } from '../../src/version-control';
import type { CommitPort } from '../../src/version-control/commits/port';
import { failure, handBuiltSpecification, removeTrackedRoots } from '../support/documents-fixture';
import {
  clockAfterBackoff,
  isolatedQueue,
  queueProject,
  queueSave,
  type QueueProject,
} from '../support/document-queue';
import { notesPath } from '../support/document-writes';
import { git } from '../support/git-project';

afterEach(removeTrackedRoots);

const FLUSH = { flush: true } as const;
const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;

const tree = (project: QueueProject, now?: () => number) =>
  readSpecificationDocumentTree(project.engine, project.specId, now ? { now } : {});

const node = (read: Awaited<ReturnType<typeof tree>>, index: number) =>
  read.documents.find((document) => document.path === notesPath(index))!;

/** A commit port whose commit does `before` and then fails with an uncertain outcome. */
function uncertainPort(project: QueueProject, before: () => void): CommitPort {
  return {
    ...openVersionControl(project.engine).commits,
    commit: () => {
      before();
      throw new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'uncertain', 'mutation-timeout');
    },
  };
}

/** A save that stays `queued`: the queue has not run. */
async function pendingProject(): Promise<{ project: QueueProject; id: string }> {
  const project = await queueProject();
  return { project, id: await queueSave(project, 1, 'one\n') };
}

/** A save whose commit failed permanently (the branch changed): `commit-failed`. */
async function failedProject(): Promise<{ project: QueueProject; id: string }> {
  const { project, id } = await pendingProject();
  git(project.root, 'checkout', '-q', '-b', 'somewhere-else');
  await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
  return { project, id };
}

describe('a pending commit', () => {
  it('is marked on the document, counted, and changes the revision; an unrelated read does not', async () => {
    const project = await queueProject();
    const before = await tree(project);
    expect(before.commits).toEqual({
      pending: 0,
      failed: 0,
      recoveryRequired: 0,
      uncommitted: 0,
      policy: 'auto',
    });

    const id = await queueSave(project, 1, 'one\n');
    const pending = await tree(project);
    expect(Value.Check(DocumentTreeSchema, pending)).toBe(true);
    expect(pending.revision).not.toBe(before.revision);
    expect(node(pending, 1).commit).toMatchObject({
      state: 'pending',
      operationId: id,
      attempts: 0,
    });
    expect(node(pending, 2).commit).toBeUndefined();
    expect(pending.commits).toMatchObject({ pending: 1, failed: 0 });
    expect(pending.commits?.oldestPendingAt).toBeDefined();
    // Pending is not an obstacle: the document can be saved again and renamed.
    expect(node(pending, 1).actions.save).toEqual({ available: true });
    expect(node(pending, 1).actions.rename).toEqual({ available: true });

    // Reads that change nothing do not change the revision, whatever the time.
    const later = await tree(project, () => Date.now() + 3_600_000);
    expect(later.revision).toBe(pending.revision);
    await readRegisteredDocumentSummaries(project.engine, project.specId);
    expect((await tree(project)).revision).toBe(pending.revision);
  });

  it('shows the waiting reason, the attempts and the next attempt of a retried commit', async () => {
    const { project, id } = await pendingProject();
    await writeFile(join(project.root, '.git', 'index.lock'), '');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    const waiting = await tree(project);
    expect(node(waiting, 1).commit).toMatchObject({
      state: 'pending',
      operationId: id,
      reason: 'index-locked',
      attempts: 1,
    });
    expect(node(waiting, 1).commit?.nextAttemptAt).toBeDefined();
  });

  it('carries the commit on the summaries of the workspace section', async () => {
    const { project, id } = await pendingProject();
    const summaries = await readRegisteredDocumentSummaries(project.engine, project.specId);
    const notes = summaries.find((summary) => summary.path === notesPath(1))!;
    expect(notes.commit).toMatchObject({ state: 'pending', operationId: id });
    expect(summaries.find((summary) => summary.path === notesPath(2))!.commit).toBeUndefined();
  });
});

describe('a failed commit', () => {
  it('is marked failed with its reason, blocks the covered path and nothing else', async () => {
    const { project, id } = await failedProject();
    const read = await tree(project);
    expect(node(read, 1).commit).toMatchObject({
      state: 'failed',
      operationId: id,
      reason: 'branch-changed',
    });
    expect(node(read, 1).commit?.recoveryRequired).toBeUndefined();
    expect(read.commits).toMatchObject({ pending: 0, failed: 1, recoveryRequired: 0 });
    expect(node(read, 1).actions.save).toEqual({ available: false, reason: 'commit-blocked' });
    expect(node(read, 1).actions.delete).toEqual({ available: false, reason: 'commit-blocked' });
    expect(node(read, 2).actions.save).toEqual({ available: true });
    expect(read.capabilities.createFile).toEqual({ available: true });
  });

  it('answers the status with the stage, the reason and the actions that resolve it', async () => {
    const { project, id } = await failedProject();
    const status = await readDocumentOperationStatus(project.engine, id);
    expect(status).toMatchObject({
      operationId: id,
      specId: project.specId,
      action: 'save',
      documentIds: ['notes-1'],
      stage: 'commit-failed',
      commit: { state: 'failed', reason: 'branch-changed', batchId: id },
      batchMembers: [id],
      actions: {
        retry: { available: true },
        abandon: { available: true },
        recover: { available: false },
      },
    });
    expect(status.commit.sha).toBeUndefined();
  });

  it('lists a failed commit as a row without paths', async () => {
    const { project, id } = await failedProject();
    const rows = await listDocumentOperationRows(project.engine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operationId: id,
      kind: 'document-change',
      status: 'failed',
      state: 'failed',
      code: 'COMMIT_BLOCKED',
      action: 'save',
      documentCount: 1,
      subject: { specId: project.specId },
      staleExempt: true,
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('.md');
    expect(text).not.toContain(project.root);
  });
});

describe('a commit that needs recovery', () => {
  async function recoveryProject(): Promise<{ project: QueueProject; id: string }> {
    const { project, id } = await pendingProject();
    const port = uncertainPort(project, () =>
      git(project.root, ...HUMAN, 'commit', '-q', '--allow-empty', '-m', 'human'),
    );
    await runQueueOnce(project.engine, isolatedQueue({ commits: port }), undefined, FLUSH);
    return { project, id };
  }

  it('is failed with recoveryRequired, holds its paths with no retry, and is a recovery row', async () => {
    const { project, id } = await recoveryProject();
    const read = await tree(project);
    expect(node(read, 1).commit).toMatchObject({
      state: 'failed',
      operationId: id,
      recoveryRequired: true,
    });
    expect(read.commits).toMatchObject({ failed: 1, recoveryRequired: 1 });
    expect(node(read, 1).actions.save).toEqual({ available: false, reason: 'busy' });
    expect(node(read, 2).actions.save).toEqual({ available: true });

    const status = await readDocumentOperationStatus(project.engine, id);
    expect(status).toMatchObject({
      stage: 'recovery-required',
      commit: { state: 'failed', recoveryRequired: true },
      actions: {
        retry: { available: false },
        abandon: { available: false },
        recover: { available: true },
      },
    });
    expect(status.executor).toBeUndefined();

    const rows = await listDocumentOperationRows(project.engine);
    expect(rows).toMatchObject([
      { operationId: id, status: 'recovery-required', staleExempt: true },
    ]);
  });
});

describe('an abandoned commit', () => {
  it('shows as uncommitted from the ledger, never blocks the document, and is not a row', async () => {
    const { project, id } = await failedProject();
    await abandonDocumentCommit(project.engine, id);
    const read = await tree(project);
    expect(node(read, 1).commit).toMatchObject({
      state: 'uncommitted',
      operationId: id,
      reason: 'abandoned',
    });
    expect(read.commits).toMatchObject({ failed: 0, uncommitted: 1 });
    expect(node(read, 1).actions.save).toEqual({ available: true });

    const status = await readDocumentOperationStatus(project.engine, id);
    expect(status).toMatchObject({
      stage: 'completed',
      commit: { state: 'uncommitted', reason: 'abandoned' },
    });
    // Uncommitted is not a failure: nothing is listed.
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);
  });

  it('is resolved by recovering with abandon the same way', async () => {
    const { project, id } = await pendingProject();
    const port = uncertainPort(project, () =>
      git(project.root, ...HUMAN, 'commit', '-q', '--allow-empty', '-m', 'human'),
    );
    await runQueueOnce(project.engine, isolatedQueue({ commits: port }), undefined, FLUSH);
    await recoverDocumentOperation(project.engine, id, 'abandon');
    expect(node(await tree(project), 1).commit?.state).toBe('uncommitted');
  });
});

describe('a committed operation', () => {
  it('leaves the tree and the list, and the status keeps answering from the settled record', async () => {
    const { project, id } = await pendingProject();
    const pending = await tree(project);
    await runQueueOnce(
      project.engine,
      isolatedQueue({ clock: clockAfterBackoff() }),
      undefined,
      FLUSH,
    );

    const done = await tree(project);
    expect(node(done, 1).commit).toBeUndefined();
    expect(done.commits).toEqual({
      pending: 0,
      failed: 0,
      recoveryRequired: 0,
      uncommitted: 0,
      policy: 'auto',
    });
    expect(done.revision).not.toBe(pending.revision);
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);

    const status = await readDocumentOperationStatus(project.engine, id);
    expect(status).toMatchObject({
      operationId: id,
      stage: 'completed',
      commit: { state: 'committed' },
      actions: {
        retry: { available: false },
        abandon: { available: false },
        recover: { available: false },
      },
    });
    expect(status.commit.sha).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('answers not found for an unknown operation, a malformed id and another Specification', async () => {
    const { project, id } = await pendingProject();
    for (const unknown of [randomUUID(), 'not-a-uuid']) {
      expect(await failure(readDocumentOperationStatus(project.engine, unknown))).toMatchObject({
        code: 'DOCUMENT_OPERATION_NOT_FOUND',
      });
    }
    expect(
      await failure(readDocumentOperationStatus(project.engine, id, { specId: 'someone-else' })),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_NOT_FOUND' });
    expect(
      await readDocumentOperationStatus(project.engine, id, { specId: project.specId }),
    ).toMatchObject({ operationId: id });
  });
});

describe('pending rows', () => {
  it('lists a commit only after it has waited 30 seconds', async () => {
    const { project, id } = await pendingProject();
    const queuedAt = Date.parse(
      (await readDocumentOperationStatus(project.engine, id)).commit.queuedAt!,
    );
    expect(
      await listDocumentOperationRows(project.engine, {
        now: () => queuedAt + DOCUMENT_ROW_PENDING_AFTER_MS - 1,
      }),
    ).toEqual([]);
    const rows = await listDocumentOperationRows(project.engine, {
      now: () => queuedAt + DOCUMENT_ROW_PENDING_AFTER_MS,
    });
    expect(rows).toMatchObject([{ operationId: id, status: 'queued', state: 'queued' }]);
    expect(rows[0]).not.toHaveProperty('code');
  });

  it('reports an overdue commit in the status after five minutes', async () => {
    const { project, id } = await pendingProject();
    const queuedAt = Date.parse(
      (await readDocumentOperationStatus(project.engine, id)).commit.queuedAt!,
    );
    const status = await readDocumentOperationStatus(project.engine, id, {
      now: () => queuedAt + 6 * 60_000,
    });
    expect(status.commit.overdue).toBe(true);
  });
});

describe('a write whose process is gone', () => {
  const NAMESPACE = 'ns-1';
  const table = (alive: boolean): ProcessTable => ({
    pid: 1,
    platform: 'linux',
    hostId: () => 'host-1',
    threadId: 0,
    readText: (path) =>
      Promise.resolve(
        path.endsWith('/boot_id')
          ? 'boot-1'
          : alive && path === '/proc/4242/stat'
            ? '4242 (node) S ' + '0 '.repeat(18) + '123456'
            : undefined,
      ),
    readLink: (path) => Promise.resolve(path.endsWith('/pid') ? NAMESPACE : undefined),
  });

  async function writingJournal(project: QueueProject): Promise<string> {
    const operationId = randomUUID();
    const plan: DocumentChangePlan = {
      version: 1,
      action: 'save',
      specId: project.specId,
      slug: 'hand',
      directory: 'specs/active/hand',
      paths: [
        {
          path: 'specs/active/hand/' + notesPath(1),
          role: 'document',
          pre: null,
          post: { sha256: 'a'.repeat(64), bytes: 1 },
          source: { kind: 'payload' },
        },
      ],
      documents: [],
      removedDocumentIds: [],
      folders: [],
      allocatedIds: [],
      templates: [],
    };
    const encoded = encodePlan(plan);
    const context = project.engine.context;
    await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
      await writePayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
        { sha256: encoded.sha256, content: encoded.text },
      ]);
      await publishJournal(
        context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        buildJournal('files-writing', {
          projectId: context.project.projectId,
          operationId,
          specId: project.specId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          plan: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 1, documentCount: 0 },
          executor: {
            pid: 4242,
            hostId: 'host-1',
            platform: 'linux',
            threadId: 0,
            pidNamespaceId: NAMESPACE,
            processStartTime: '123456',
            bootId: 'boot-1',
          },
        }),
      );
    });
    return operationId;
  }

  it('is pending while the process runs and needs recovery once it is provably dead', async () => {
    const project = await queueProject();
    const id = await writingJournal(project);

    const running = { processTable: table(true) };
    const pending = await readSpecificationDocumentTree(project.engine, project.specId, running);
    expect(node(pending, 1).commit).toMatchObject({ state: 'pending', reason: 'writing' });
    expect(node(pending, 1).actions.save).toMatchObject({ reason: 'busy', retryAfterMs: 1000 });
    expect(await listDocumentOperationRows(project.engine, running)).toEqual([]);
    expect((await readDocumentOperationStatus(project.engine, id, running)).executor).toEqual({
      state: 'alive',
    });

    const gone = { processTable: table(false) };
    const dead = await readSpecificationDocumentTree(project.engine, project.specId, gone);
    expect(node(dead, 1).commit).toMatchObject({
      state: 'failed',
      recoveryRequired: true,
      reason: 'write-interrupted',
    });
    expect(dead.revision).not.toBe(pending.revision);
    expect(await listDocumentOperationRows(project.engine, gone)).toMatchObject([
      { operationId: id, status: 'recovery-required', code: 'OPERATION_INTERRUPTED' },
    ]);
    const status = await readDocumentOperationStatus(project.engine, id, gone);
    expect(status).toMatchObject({
      stage: 'files-writing',
      executor: { state: 'dead' },
      commit: { state: 'failed', recoveryRequired: true },
      actions: { recover: { available: true } },
    });
  });
});

describe('what a read does not do', () => {
  it('holds no lock, starts no Git process and writes nothing', async () => {
    const { project, id } = await failedProject();
    const listing = async (): Promise<string[]> =>
      (await readdir(project.engine.context.project.stateRoot, { recursive: true })).sort();
    const before = await listing();
    const status = git(project.root, 'status', '--porcelain', '--untracked-files=all');

    const spawns: string[][] = [];
    const listener = (message: unknown): void => {
      spawns.push([...(message as { args: readonly string[] }).args]);
    };
    // The control lock is HELD while the reads run: a read that tried to take it would fail or hang.
    await withProjectControlLock(project.engine.context, async () => {
      subscribe('nevo.specflow.engine.git-process', listener);
      try {
        await tree(project);
        await readRegisteredDocumentSummaries(project.engine, project.specId);
        await readDocumentOperationStatus(project.engine, id);
        await listDocumentOperationRows(project.engine);
      } finally {
        unsubscribe('nevo.specflow.engine.git-process', listener);
      }
    });
    expect(spawns).toEqual([]);
    expect(await listing()).toEqual(before);
    expect(git(project.root, 'status', '--porcelain', '--untracked-files=all')).toBe(status);
  }, 240000);

  it('survives a corrupt journal: it counts it, blocks writes and lists it', async () => {
    const { project } = await pendingProject();
    const corrupt = randomUUID();
    const directory = join(
      project.engine.context.project.stateRoot,
      'engine',
      'operations',
      'documents',
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, corrupt + '.json'), '{"version":1,"broken":');
    // A truncated file is unsupported (not valid JSON): it claims nothing and is ignored.
    expect((await tree(project)).commits?.pending).toBe(1);
    // A current-format file that does not validate is unreadable: reads tolerate it and say so.
    await writeFile(
      join(directory, corrupt + '.json'),
      JSON.stringify({ version: 1, wrong: true }),
    );
    const read = await tree(project);
    expect(read.capabilities.createFile).toEqual({ available: false, reason: 'commit-blocked' });
    expect(await listDocumentOperationRows(project.engine)).toMatchObject([
      { operationId: corrupt, status: 'recovery-required', unreadable: true },
    ]);
    expect(await failure(readDocumentOperationStatus(project.engine, corrupt))).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
    });
  });
});

describe('performance', () => {
  it('reads a tree of 2000 documents with 200 open journals within a sane bound', async () => {
    const project = await queueProject({ notes: 1 });
    const files: Record<string, string> = {};
    const documents: { id: string; path: string; type: string }[] = [
      { id: 'overview', path: 'overview.md', type: 'overview' },
    ];
    for (let index = 0; index < 2000; index += 1) {
      files[`bulk/doc-${index}.md`] = `document ${index}\n`;
    }
    const spec = await handBuiltSpecification(project, {
      slug: 'bulk',
      documents,
      files: { 'overview.md': '# Bulk\n', ...files },
    });
    git(project.root, 'add', 'specs');
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'bulk');

    const context = project.engine.context;
    await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
      for (let index = 0; index < 200; index += 1) {
        const operationId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        const plan: DocumentChangePlan = {
          version: 1,
          action: 'save',
          specId: spec.specId,
          slug: 'bulk',
          directory: 'specs/active/bulk',
          paths: [
            {
              path: `specs/active/bulk/bulk/doc-${index}.md`,
              role: 'document',
              pre: null,
              post: { sha256: 'a'.repeat(64), bytes: 1 },
              source: { kind: 'payload' },
            },
          ],
          documents: [],
          removedDocumentIds: [],
          folders: [],
          allocatedIds: [],
          templates: [],
        };
        const encoded = encodePlan(plan);
        await writePayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
          { sha256: encoded.sha256, content: encoded.text },
        ]);
        await publishJournal(
          context,
          DOCUMENT_CHANGE_JOURNAL_KIND,
          buildJournal('queued', {
            projectId: context.project.projectId,
            operationId,
            specId: spec.specId,
            workspaceId: project.workspaceId,
            workspaceRoot: project.root,
            sequence: index + 1,
            plan: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 1, documentCount: 0 },
          }),
        );
      }
    });

    clearCommitReadMemo();
    const subject = {
      specId: spec.specId,
      workspaceId: project.workspaceId,
      directory: 'specs/active/bulk',
    };
    // Only the result is judged: a read that did not finish is caught by the test timeout, not by a
    // wall-clock bound that a slow runner would trip.
    const cold = await readDocumentCommitView(context, subject);
    const warm = await readDocumentCommitView(context, subject);
    expect(cold.summary.pending).toBe(200);
    expect(cold.markers.size).toBe(200);
    expect(warm.summary).toEqual(cold.summary);

    const read = await readSpecificationDocumentTree(project.engine, spec.specId);
    expect(read.documents).toHaveLength(2001);
    expect(read.commits?.pending).toBe(200);
  }, 240000);
});
