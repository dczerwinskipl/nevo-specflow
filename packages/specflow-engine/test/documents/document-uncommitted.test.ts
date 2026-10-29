// Integration (real project, real Git): the documents with auto-commit off (ADR 0018). A write
// completes uncommitted at once and is recorded in the ledger, with no queue, no preflight and no
// Git mutation; the ledger survives, bounds itself, pins the manifest baseline and is pruned by a
// commit; a policy flip never commits silently.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS, onPosix } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange, resumeDocumentChange } from '../../src/specs/documents/api';
import { WriterInterrupted } from '../../src/specs/documents/write/file-effects';
import {
  readDocumentOperationStatus,
  readSpecificationDocumentTree,
  listDocumentOperationRows,
  readSpecificationUncommitted,
} from '../../src/specs/documents/reading';
import {
  ledgerPath,
  recordLedgerEntries,
  withLedgerLock,
  LEDGER_BRANCH_MAX_CHARACTERS,
  LEDGER_MAX_PATHS,
} from '../../src/specs/durable';
import { pruneUncommitted } from '../../src/specs/uncommitted';
import { drainQueue } from '../../src/specs/documents/queue/worker';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import {
  GIT_ON,
  activeJournals,
  ledgerOf,
  ledgerPaths,
  notesPath,
  notesText,
  setLocalAutoCommit,
  checkoutClaimFree,
  writableProject,
} from '../support/document-writes';
import {
  clockAfterBackoff,
  commitCount,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueRecords,
  queueSave,
  type QueueProject,
} from '../support/document-queue';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { git } from '../support/git-project';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;
const specPath = (index: number): string => `specs/active/hand/${notesPath(index)}`;
const FLUSH = { flush: true } as const;

async function manualProject(): Promise<QueueProject> {
  const project = await queueProject();
  await setLocalAutoCommit(project, false);

  return project;
}

function save(project: QueueProject, index: number, content: string, operationId = randomUUID()) {
  return applyDocumentChange(project.engine, project.specId, operationId, {
    action: 'save',
    documentId: `notes-${index}`,
    content,
    expectedRevision: sha256Hex(
      project.content.get(`${project.specId}:${index}`) ?? notesText(index),
    ),
  }).then((result) => {
    project.content.set(`${project.specId}:${index}`, content);

    return result;
  });
}

describe('a save with auto-commit off', () => {
  it('answers uncommitted at once: files on disk, ledger entry, no queue, no Git mutation', async () => {
    const project = await manualProject();
    const before = commitCount(project);
    const operationId = randomUUID();
    const result = await save(project, 1, 'not committed\n', operationId);

    expect(result.stage).toBe('completed');
    expect(result.commit).toMatchObject({ state: 'uncommitted', reason: 'auto-commit-off' });
    expect(result.commit.sha).toBeUndefined();
    expect(await readFile(join(project.dir, notesPath(1)), 'utf8')).toBe('not committed\n');
    expect(commitCount(project)).toBe(before);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(await checkoutClaimFree(project)).toBe(true);

    // The journal is settled with the pinned mode; the ledger holds the post-image and the operation.
    expect(await findDocumentChangeJournal(project.engine.context, operationId)).toMatchObject({
      stage: 'completed',
      outcome: 'uncommitted',
      reason: 'auto-commit-off',
      commitMode: 'manual',
    });
    const record = await ledgerOf(project);
    expect(record?.branch).toBe('feature/work');
    expect(record?.entries).toEqual([
      expect.objectContaining({
        path: specPath(1),
        postSha256: sha256Hex('not committed\n'),
        operationIds: [operationId],
        operationCount: 1,
        reason: 'auto-commit-off',
      }),
    ]);

    // The ledger is a durable file: it does not depend on this process.
    const onDisk = JSON.parse(
      await readFile(
        ledgerPath(project.engine.context, project.workspaceId, {
          kind: 'specification',
          id: project.specId,
        }),
        'utf8',
      ),
    ) as { entries: { path: string }[] };
    expect(onDisk.entries.map((entry) => entry.path)).toEqual([specPath(1)]);
  });

  it('replays by operation id, and a second save of the path updates its one entry', async () => {
    const project = await manualProject();
    const first = randomUUID();
    const original = await save(project, 1, 'one\n', first);
    const replay = await applyDocumentChange(project.engine, project.specId, first, {
      action: 'save',
      documentId: 'notes-1',
      content: 'one\n',
      expectedRevision: sha256Hex(notesText(1)),
    });
    expect(replay).toMatchObject({ replayed: true, commit: original.commit });
    expect((await ledgerOf(project))?.entries[0]?.operationCount).toBe(1);

    const second = randomUUID();
    await save(project, 1, 'two\n', second);
    const entries = (await ledgerOf(project))?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      postSha256: sha256Hex('two\n'),
      operationIds: [first, second],
      operationCount: 2,
    });
  });

  it('shows up in the reads: the document, the tree summary, the status and the ledger read', async () => {
    const project = await manualProject();
    const operationId = randomUUID();
    await save(project, 2, 'visible\n', operationId);

    const tree = await readSpecificationDocumentTree(project.engine, project.specId);
    expect(tree.commits).toMatchObject({ pending: 0, failed: 0, uncommitted: 1, policy: 'manual' });
    expect(tree.documents.find((document) => document.id === 'notes-2')?.commit).toMatchObject({
      state: 'uncommitted',
      operationId,
      reason: 'auto-commit-off',
    });
    expect(tree.documents.find((document) => document.id === 'notes-1')?.commit).toBeUndefined();

    const status = await readDocumentOperationStatus(project.engine, operationId);
    expect(status).toMatchObject({
      stage: 'completed',
      commit: { state: 'uncommitted', reason: 'auto-commit-off' },
    });
    // Uncommitted is not a failure: it is never listed.
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);

    const view = await readSpecificationUncommitted(project.engine, project.specId);
    expect(view).toMatchObject({
      policy: { documents: 'manual', source: 'local' },
      queue: { pending: 0, failed: 0, recoveryRequired: 0 },
      entries: [
        {
          path: specPath(2),
          documentId: 'notes-2',
          reason: 'auto-commit-off',
          operations: 1,
        },
      ],
    });
    const again = await readSpecificationUncommitted(project.engine, project.specId);
    expect(again.ledgerRevision).toBe(view.ledgerRevision);
    await save(project, 3, 'more\n');
    expect(
      (await readSpecificationUncommitted(project.engine, project.specId)).ledgerRevision,
    ).not.toBe(view.ledgerRevision);
  });

  it('needs no preflight: it succeeds on a protected branch and on a detached HEAD', async () => {
    const project = await manualProject();
    await writeFile(
      join(project.root, '.nevo', 'config.yaml'),
      GIT_ON + '  commits:\n    protectedBranches: [feature/work]\n',
    );
    const protectedWrite = await save(project, 1, 'on a protected branch\n');
    expect(protectedWrite.commit.state).toBe('uncommitted');

    git(project.root, 'checkout', '-q', '--detach');
    const detached = await save(project, 2, 'on a detached head\n');
    expect(detached.commit.state).toBe('uncommitted');
    // A detached HEAD pins no branch for a ledger that was empty; this one already pinned its own.
    expect((await ledgerOf(project))?.branch).toBe('feature/work');
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
  });

  it('is refused only for what a plain write is refused for: a stale revision writes nothing', async () => {
    const project = await manualProject();
    const error = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), {
        action: 'save',
        documentId: 'notes-1',
        content: 'x\n',
        expectedRevision: sha256Hex('not the content'),
      }),
    );
    expect(error).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
    expect(await ledgerOf(project)).toBeUndefined();
  });
});

describe('a stop inside the completion', () => {
  const CUTS = [
    { name: 'before the completion', ledger: false, stage: 'files-writing' },
    { name: 'after the ledger write', ledger: true, stage: 'files-writing' },
    { name: 'after the completion', ledger: true, stage: 'completed' },
  ] as const;

  it.each(CUTS)(
    '$name: the ledger precedes the journal and a replay finishes it once',
    async (cut) => {
      const project = await manualProject();
      const operationId = randomUUID();
      const stopAt = (point: string) => () => Promise.reject(new WriterInterrupted(point));
      const hooks =
        cut.name === 'before the completion'
          ? {
              beforeJournalWrite: (stage: string) =>
                stage === 'completed' ? stopAt(cut.name)() : Promise.resolve(),
            }
          : cut.name === 'after the ledger write'
            ? { afterLedgerWrite: stopAt(cut.name) }
            : {
                afterJournalWrite: (stage: string) =>
                  stage === 'completed' ? stopAt(cut.name)() : Promise.resolve(),
              };
      await expect(
        applyDocumentChange(
          project.engine,
          project.specId,
          operationId,
          {
            action: 'save',
            documentId: 'notes-1',
            content: 'interrupted\n',
            expectedRevision: sha256Hex(notesText(1)),
          },
          { hooks },
        ),
      ).rejects.toBeInstanceOf(WriterInterrupted);

      // At the stop: a ledger entry exists whenever the journal says anything is done.
      expect(await ledgerPaths(project)).toEqual(cut.ledger ? [specPath(1)] : []);
      expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
        cut.stage,
      );

      const replay = await resumeDocumentChange(project.engine, operationId);
      expect(replay.commit).toMatchObject({ state: 'uncommitted', reason: 'auto-commit-off' });
      expect(await ledgerOf(project)).toMatchObject({
        entries: [{ path: specPath(1), operationIds: [operationId], operationCount: 1 }],
      });
      expect(await checkoutClaimFree(project)).toBe(true);
      expect(engineCommits(project)).toEqual([]);
      expect(await readFile(join(project.dir, notesPath(1)), 'utf8')).toBe('interrupted\n');
    },
  );
});

describe('the policy does not apply where it must not', () => {
  it('is inert while Git is disabled: the write completes not-applicable and nothing is recorded', async () => {
    const project = await writableProject({ git: false });
    await setLocalAutoCommit(project, false);
    const result = await applyDocumentChange(project.engine, project.specId, randomUUID(), {
      action: 'save',
      documentId: 'notes-1',
      content: 'no git\n',
      expectedRevision: sha256Hex(notesText(1)),
    });
    expect(result.commit).toMatchObject({ state: 'not-applicable', reason: 'git-disabled' });
    expect(await ledgerOf(project)).toBeUndefined();
    const tree = await readSpecificationDocumentTree(project.engine, project.specId);
    expect(tree.commits).not.toHaveProperty('policy');
  });

  it('reads the committed value, and the local one wins over it', async () => {
    const project = await queueProject();
    await setLocalAutoCommit(project, undefined);
    await writeFile(
      join(project.root, '.nevo', 'config.yaml'),
      GIT_ON + '  commits:\n    auto:\n      documents: false\n',
    );
    expect((await save(project, 1, 'committed config\n')).commit.state).toBe('uncommitted');
    await setLocalAutoCommit(project, true);
    expect((await save(project, 2, 'local wins\n')).commit.state).toBe('pending');
  });
});

describe('the manifest baseline', () => {
  const folder = (project: QueueProject, path: string) =>
    applyDocumentChange(project.engine, project.specId, randomUUID(), { action: 'folder', path });

  it('is the ledger post-image: two registry changes in a row, and a foreign edit is still caught', async () => {
    const project = await manualProject();
    await folder(project, 'docs');
    // The manifest differs from HEAD now; the ledger post-image is what it is judged against.
    expect(await ledgerPaths(project)).toContain('specs/active/hand/specification.yaml');
    await folder(project, 'more');

    const manifest = join(project.dir, 'specification.yaml');
    await writeFile(manifest, (await readFile(manifest, 'utf8')) + '# edited by hand\n');
    const error = await failure(folder(project, 'third'));
    expect(error).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
  });
});

describe('the ledger is bounded', () => {
  it('refuses the 201st distinct path before writing anything, and still updates a known one', async () => {
    const project = await manualProject();
    await withLedgerLock(project.engine.context, () =>
      recordLedgerEntries(
        project.engine.context,
        {
          projectId: project.engine.context.project.projectId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          owner: { kind: 'specification', id: project.specId },
        },
        {
          operationId: randomUUID(),
          reason: 'auto-commit-off',
          recordedAt: new Date().toISOString(),
          branch: 'feature/work',
          head: null,
          paths: Array.from({ length: LEDGER_MAX_PATHS - 1 }, (_, index) => ({
            path: `specs/active/hand/gone-${index}.md`,
            postSha256: null,
          })),
        },
      ),
    );
    await save(project, 1, 'the 200th\n');
    const refused = await failure(save(project, 2, 'the 201st\n'));
    expect(refused).toMatchObject({ code: 'DOCUMENT_UNCOMMITTED_LIMIT' });
    expect(await readFile(join(project.dir, notesPath(2)), 'utf8')).toBe(notesText(2));
    expect((await ledgerOf(project))?.entries).toHaveLength(LEDGER_MAX_PATHS);
    // A path the ledger knows is not a new one.
    expect((await save(project, 1, 'updated\n')).commit.state).toBe('uncommitted');
  });
});

describe('the ledger is bounded by what its record can pin', () => {
  it.skipIf(!onPosix)(
    'refuses a save on a branch name the record cannot hold before writing anything',
    async () => {
      const project = await manualProject();
      git(
        project.root,
        'checkout',
        '-q',
        '-b',
        'feature/' + 'a'.repeat(LEDGER_BRANCH_MAX_CHARACTERS),
      );

      const refused = await failure(save(project, 1, 'never written\n'));

      expect(refused).toMatchObject({
        code: 'COMMIT_BLOCKED',
        details: { blockedBy: 'branch-name-too-long' },
      });
      expect(await readFile(join(project.dir, notesPath(1)), 'utf8')).toBe(notesText(1));
      expect(await ledgerOf(project)).toBeUndefined();
      expect(await activeJournals(project.engine)).toEqual([]);
    },
  );
});

describe('a hand commit prunes the ledger', () => {
  it('removes the entries a commit holds, and keeps the ones it does not', async () => {
    const project = await manualProject();
    await save(project, 1, 'one\n');
    await save(project, 2, 'two\n');
    git(project.root, 'add', specPath(1));
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'one by hand');

    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 1, remaining: 1 });
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 0, remaining: 1 });
    git(project.root, 'add', specPath(2));
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'two by hand');
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 1, remaining: 0 });
    expect(await ledgerOf(project)).toBeUndefined();
    expect(engineCommits(project)).toEqual([]);
  });

  it('does not prune a path that was changed again after the commit', async () => {
    const project = await manualProject();
    await save(project, 1, 'one\n');
    git(project.root, 'add', specPath(1));
    git(project.root, ...HUMAN, 'commit', '-q', '-m', 'one by hand');
    await save(project, 1, 'one, edited\n');
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 0, remaining: 1 });
  });
});

describe('policy flips', () => {
  it('on to off: queued work keeps its pinned mode and drains; later writes are uncommitted', async () => {
    const project = await queueProject();
    const queued = await queueSave(project, 1, 'queued before the flip\n');
    await setLocalAutoCommit(project, false);
    const after = await save(project, 2, 'written after the flip\n');
    expect(after.commit.state).toBe('uncommitted');
    expect(await findDocumentChangeJournal(project.engine.context, queued)).toMatchObject({
      stage: 'queued',
      commitMode: 'auto',
    });

    const results = await drainQueue(
      project.engine,
      isolatedQueue({ clock: clockAfterBackoff() }),
      undefined,
      FLUSH,
    );
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [queued] });
    expect(engineCommits(project)).toHaveLength(1);
    // Only the manual write is left in the ledger, and still not committed.
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);
    expect(git(project.root, 'status', '--porcelain')).toContain(notesPath(2));
  });

  it('off to on: nothing is committed silently; a later auto write of the path commits it and prunes', async () => {
    const project = await manualProject();
    await save(project, 1, 'left uncommitted\n');
    await save(project, 2, 'also left\n');
    await setLocalAutoCommit(project, true);
    const before = commitCount(project);

    const idle = await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(idle.every((entry) => entry.status === 'idle')).toBe(true);
    expect(commitCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);

    const later = await save(project, 1, 'saved again, automatically\n');
    expect(later.commit.state).toBe('pending');
    await drainQueue(
      project.engine,
      isolatedQueue({ clock: clockAfterBackoff() }),
      undefined,
      FLUSH,
    );
    expect(commitCount(project)).toBe(before + 1);
    // The commit held notes-1 only; notes-2 is still the ledger's.
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);
  });
});
