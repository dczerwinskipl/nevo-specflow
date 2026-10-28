// Integration (real project, real Git): the happy path of the document commit queue. Consolidation
// of queued operations into one commit per Specification, the barrier and settle rules, the guard
// against foreign edits, the lease, and the stops of the claim in the middle of its writes.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { DOCUMENT_BATCH_RELATIVE_DIR } from '../../src/specs/documents/changes/journal';
import { documentBatchViews } from '../../src/specs/documents/queue/batch-store';
import { drainQueue, runQueueOnce } from '../../src/specs/documents/queue/worker';
import { QueueInterrupted, type QueueHooks } from '../../src/specs/documents/queue/types';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import { notesPath, notesText, saveNotes } from '../support/document-writes';
import {
  addSpecification,
  alignWall,
  clockAfterBackoff,
  commitCount,
  committedPaths,
  currentNotes,
  editNotesByHand,
  engineCommits,
  isolatedQueue,
  manualClock,
  queueProject,
  queueRecords,
  queueSave,
  saveIn,
  trailersOf,
  workingTreeClean,
} from '../support/document-queue';
import { git } from '../support/git-project';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const FLUSH = { flush: true } as const;

describe('consolidation into one commit per Specification', () => {
  it('commits five saves of one document as ONE commit with the last content and the right trailers', async () => {
    const project = await queueProject();
    const before = commitCount(project);
    const ids: string[] = [];
    for (let n = 1; n <= 5; n += 1) ids.push(await queueSave(project, 1, `version ${n}\n`));

    const results = await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(results.map((result) => result.status)).toEqual(['committed', 'idle']);
    const committed = results[0]!;
    if (committed.status !== 'committed') throw new Error('expected a commit');

    expect(commitCount(project)).toBe(before + 1);
    expect(committed.operationIds).toEqual(ids);
    expect(committed.batchId).toBe(ids[0]);
    const trailers = trailersOf(project, committed.sha);
    expect(trailers).toMatchObject({
      'Nevo-Operation': ids[0],
      'Nevo-Kind': 'document-change',
      'Nevo-Spec': project.specId,
      'Nevo-Action': 'save',
      'Nevo-Documents': notesPath(1),
      'Nevo-Coalesced': ids.slice(1).join(','),
    });
    expect(committedPaths(project, committed.sha)).toEqual([`specs/active/hand/${notesPath(1)}`]);
    expect(git(project.root, 'show', `${committed.sha}:specs/active/hand/${notesPath(1)}`)).toBe(
      'version 5',
    );
    // The message says what happened; the trailers stay the last paragraph.
    expect(git(project.root, 'log', '-1', '--format=%s', committed.sha)).toBe(
      `spec(documents): update ${notesPath(1)} in hand`,
    );
    const body = git(project.root, 'log', '-1', '--format=%b', committed.sha);
    expect(body.split('\n').slice(0, 5)).toEqual([
      `update ${notesPath(1)}`,
      '',
      '5 document operations in one commit',
      '',
      `Nevo-Operation: ${ids[0]}`,
    ]);

    for (const id of ids) {
      const journal = await findDocumentChangeJournal(project.engine.context, id);
      expect(journal).toMatchObject({
        stage: 'completed',
        outcome: 'committed',
        sha: committed.sha,
        coalescedWith: 4,
        batchId: ids[0],
      });
    }
    expect(workingTreeClean(project)).toBe(true);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('commits a save-all as one commit with every document', async () => {
    const project = await queueProject();
    const documents = [1, 2, 3].map((index) => ({
      documentId: `notes-${index}`,
      content: `all ${index}\n`,
      expectedRevision: sha256Hex(notesText(index)),
    }));
    await applyDocumentChange(project.engine, project.specId, randomUUID(), {
      action: 'save-all',
      documents,
    });
    const before = commitCount(project);
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'committed' });
    if (result.status !== 'committed') return;
    expect(commitCount(project)).toBe(before + 1);
    expect(committedPaths(project, result.sha)).toEqual(
      [1, 2, 3].map((index) => `specs/active/hand/${notesPath(index)}`).sort(),
    );
    expect(trailersOf(project, result.sha)['Nevo-Action']).toBe('save-all');
    expect(git(project.root, 'log', '-1', '--format=%s', result.sha)).toBe(
      'spec(documents): update 3 documents in hand',
    );
    expect(workingTreeClean(project)).toBe(true);
  });

  it('commits disjoint Specifications as separate batches and commits', async () => {
    const project = await queueProject();
    const second = await addSpecification(project, 'second');
    const first = await queueSave(project, 1, 'first spec\n');
    const other = await saveIn(project, second, 'second spec\n', 'second notes\n');
    const before = commitCount(project);

    const results = await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    const commits = results.filter((result) => result.status === 'committed');
    expect(commits).toHaveLength(2);
    expect(commitCount(project)).toBe(before + 2);
    const [one, two] = commits;
    if (one?.status !== 'committed' || two?.status !== 'committed') return;
    expect([one.batchId, two.batchId].sort()).toEqual([first, other].sort());
    expect(new Set([one.sha, two.sha]).size).toBe(2);
    expect(committedPaths(project, one.sha)).toHaveLength(1);
    expect(committedPaths(project, two.sha)).toHaveLength(1);
    // No path in two batches.
    expect(one.paths.filter((path) => two.paths.includes(path))).toEqual([]);
    expect(workingTreeClean(project)).toBe(true);
  });

  it('completes A -> B -> A as not-applicable without a Git mutation', async () => {
    const project = await queueProject();
    const original = notesText(1);
    const a = await queueSave(project, 1, 'changed\n');
    const b = await queueSave(project, 1, original);
    const head = git(project.root, 'rev-parse', 'HEAD');

    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'not-applicable', operationIds: [a, b] });
    expect(git(project.root, 'rev-parse', 'HEAD')).toBe(head);
    for (const id of [a, b]) {
      expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
        stage: 'completed',
        outcome: 'not-applicable',
        reason: 'nothing-to-commit',
      });
    }
    expect(workingTreeClean(project)).toBe(true);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('commits a structural operation at once and keeps the registry in the same commit', async () => {
    const project = await queueProject();
    const id = randomUUID();
    await applyDocumentChange(project.engine, project.specId, id, {
      action: 'rename',
      target: { kind: 'document', documentId: 'notes-1' },
      name: 'renamed.md',
      expectedRevision: sha256Hex(notesText(1)),
    });
    // No flush and a clock that has not moved: a structural operation does not settle.
    const result = await runQueueOnce(project.engine, isolatedQueue({ clock: manualClock() }));
    expect(result).toMatchObject({ status: 'committed', operationIds: [id] });
    if (result.status !== 'committed') return;
    expect(trailersOf(project, result.sha)['Nevo-Action']).toBe('rename');
    expect(git(project.root, 'log', '-1', '--format=%s', result.sha)).toBe(
      'spec(documents): rename notes-1.md to renamed.md in hand',
    );
    expect(committedPaths(project, result.sha)).toEqual(
      [
        'specs/active/hand/notes-1.md',
        'specs/active/hand/renamed.md',
        'specs/active/hand/specification.yaml',
      ].sort(),
    );
    expect(workingTreeClean(project)).toBe(true);
  });
});

describe('the settle window and the maximum hold', () => {
  it('waits for the settle period after the last save, then commits', async () => {
    const project = await queueProject();
    const saved = await queueSave(project, 1, 'a\n');
    const clock = manualClock();
    await alignWall(project, clock, saved);
    const deps = isolatedQueue({ clock });
    const first = await runQueueOnce(project.engine, deps);
    expect(first).toMatchObject({ status: 'idle', reason: 'settling' });
    expect(first.status === 'idle' && first.waitMs).toBeGreaterThan(0);
    expect(first.status === 'idle' && first.waitMs).toBeLessThanOrEqual(300);
    expect(engineCommits(project)).toEqual([]);

    clock.advance(301);
    expect(await runQueueOnce(project.engine, deps)).toMatchObject({ status: 'committed' });
  });

  it('honours a configured settle inside 250-500 ms and ignores one outside', async () => {
    const project = await queueProject();
    const saved = await queueSave(project, 1, 'a\n');
    const clock = manualClock();
    await alignWall(project, clock, saved);
    const deps = isolatedQueue({ clock });
    const wait = async (settleMs: number): Promise<number | undefined> => {
      const result = await runQueueOnce(project.engine, deps, undefined, { settleMs });
      return result.status === 'idle' ? result.waitMs : undefined;
    };
    expect(await wait(500)).toBeGreaterThan(300);
    expect(await wait(1000)).toBeLessThanOrEqual(300);
  });

  it('commits at the maximum hold even when saves keep arriving', async () => {
    const project = await queueProject();
    const clock = manualClock();
    const deps = isolatedQueue({ clock });
    await alignWall(project, clock, await queueSave(project, 1, 'v0\n'));
    let version = 0;
    // A save every 200 ms never lets the 300 ms settle elapse; 5 s after the first the batch is claimed.
    while ((await runQueueOnce(project.engine, deps)).status === 'idle') {
      clock.advance(200);
      version += 1;
      await alignWall(project, clock, await queueSave(project, 1, `v${version}\n`));
      if (version > 40) throw new Error('the maximum hold never ended the wait');
    }
    expect(version).toBeGreaterThanOrEqual(23);
    expect(version).toBeLessThanOrEqual(26);
    expect(engineCommits(project)).toHaveLength(1);
  });
});

describe('barriers', () => {
  it('does not claim an operation while an overlapping write is in flight, then commits both', async () => {
    const project = await queueProject();
    const first = await queueSave(project, 2, 'queued first\n');
    const free = await queueSave(project, 3, 'free\n');

    // A second save of notes-2 is mid-write (a barrier on notes-2) while the queue runs.
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const atBarrier = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const second = randomUUID();
    const writing = applyDocumentChange(
      project.engine,
      project.specId,
      second,
      {
        action: 'save',
        documentId: 'notes-2',
        content: 'queued second\n',
        expectedRevision: sha256Hex('queued first\n'),
      },
      {
        hooks: {
          onPathEffect: async (event) => {
            if (event.kind === 'staged') {
              reached();
              await paused;
            }
          },
        },
      },
    );
    await atBarrier;
    expect((await findDocumentChangeJournal(project.engine.context, second))?.stage).toBe(
      'files-writing',
    );

    const during = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    // notes-2 waits for its barrier; notes-3 does not overlap and is committed alone.
    expect(during).toMatchObject({ status: 'committed', operationIds: [free] });
    expect((await findDocumentChangeJournal(project.engine.context, first))?.stage).toBe('queued');

    release();
    await writing;
    const after = await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(after[0]).toMatchObject({ status: 'committed', operationIds: [first, second] });
    expect(workingTreeClean(project)).toBe(true);
    expect(engineCommits(project)).toHaveLength(2);
  });

  it('dissolves a failed batch when a new save overlaps it and commits both with the new write folded in', async () => {
    const project = await queueProject();
    const first = await queueSave(project, 1, 'a\n');
    await editNotesByHand(project, 1, 'someone else\n');
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      reason: 'content-changed',
    });
    // A later save of the same path may be reserved (a failed batch does not refuse it). It saves over
    // what the other writer left, so the failed batch is dissolved and both go in one commit.
    const later = randomUUID();
    await applyDocumentChange(project.engine, project.specId, later, {
      action: 'save',
      documentId: 'notes-1',
      content: 'a newer save\n',
      expectedRevision: sha256Hex('someone else\n'),
    });
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'committed', operationIds: [first, later] });
    expect(await findDocumentChangeJournal(project.engine.context, first)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
    });
    expect(workingTreeClean(project)).toBe(true);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('does not claim an operation that overlaps a failed batch of another branch', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'a\n');
    git(project.root, 'checkout', '-q', '-b', 'somewhere-else');
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      reason: 'branch-changed',
    });
    // The new save is pinned to the branch that is checked out now; it cannot join the old batch.
    const later = randomUUID();
    await applyDocumentChange(project.engine, project.specId, later, {
      action: 'save',
      documentId: 'notes-1',
      content: 'a newer save\n',
      expectedRevision: sha256Hex('a\n'),
    });
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
      reason: 'blocked',
    });
    expect((await findDocumentChangeJournal(project.engine.context, later))?.stage).toBe('queued');
  });
});

describe('the guard against foreign edits and the failure record', () => {
  it('never commits a path someone else changed: the batch fails, files stay, other Specifications go on', async () => {
    const project = await queueProject();
    const second = await addSpecification(project, 'second');
    const mine = await queueSave(project, 1, 'mine\n');
    const other = await saveIn(project, second, 'other spec\n', 'second notes\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    const before = commitCount(project);

    const results = await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(results.map((result) => result.status).sort()).toEqual(['committed', 'failed', 'idle']);
    expect(commitCount(project)).toBe(before + 1);
    const failed = results.find((result) => result.status === 'failed');
    expect(failed).toMatchObject({ outcome: 'failed', reason: 'content-changed' });
    expect(await findDocumentChangeJournal(project.engine.context, mine)).toMatchObject({
      stage: 'commit-failed',
      reason: 'content-changed',
    });
    expect((await findDocumentChangeJournal(project.engine.context, other))?.stage).toBe(
      'completed',
    );
    // The hand edit is untouched and still uncommitted; the failed batch keeps its record.
    expect(git(project.root, 'status', '--porcelain')).toContain(notesPath(1));
    expect(await queueRecords(project)).toEqual({ batches: 1, lease: false });
    // A failed batch holds its paths for the reservation guard.
    const views = await documentBatchViews.list(project.engine.context, project.workspaceId);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ batchId: mine, state: 'failed' });
  });

  it('puts the members back to queued on a transient blocker and commits once it is gone', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'later\n');
    const lock = join(project.root, '.git', 'index.lock');
    await writeFile(lock, '');
    const blocked = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(blocked).toMatchObject({
      status: 'failed',
      outcome: 'requeued',
      reason: 'index-locked',
    });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'queued',
      attempts: 1,
      reason: 'index-locked',
    });
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });

    const { rm } = await import('node:fs/promises');
    await rm(lock);
    // The next attempt waits for the backoff (1 s after the first failure).
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
      reason: 'backoff',
    });
    expect(
      await runQueueOnce(
        project.engine,
        isolatedQueue({ clock: clockAfterBackoff() }),
        undefined,
        FLUSH,
      ),
    ).toMatchObject({ status: 'committed', operationIds: [id] });
  });

  it('fails the batch permanently when the branch changed after the reservation', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'on the wrong branch\n');
    git(project.root, 'checkout', '-q', '-b', 'somewhere-else');
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      reason: 'branch-changed',
    });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'commit-failed',
      reason: 'branch-changed',
    });
    expect(engineCommits(project)).toEqual([]);
  });

  it('records an uncertain outcome as recovery-required', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'uncertain\n');
    const { GitCapabilityError } = await import('../../src/git/errors');
    const commits = (await import('../../src/version-control')).openVersionControl(
      project.engine,
    ).commits;
    // The outcome is uncertain and the repository moved meanwhile (a human committed): not decisive.
    const uncertain = {
      ...commits,
      commit: () => {
        git(
          project.root,
          '-c',
          'user.name=Human',
          '-c',
          'user.email=human@example.invalid',
          'commit',
          '--allow-empty',
          '-qm',
          'human',
        );
        return Promise.reject(new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'x', 'timeout'));
      },
    };
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({ commits: uncertain }),
      undefined,
      FLUSH,
    );
    expect(result).toMatchObject({ status: 'failed', outcome: 'recovery-required' });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'recovery-required',
      recoveryPhase: 'commit',
      reason: 'uncertain',
    });
    const views = await documentBatchViews.list(project.engine.context, project.workspaceId);
    expect(views[0]).toMatchObject({ state: 'recovery-required' });
  });

  it('lets a caller replace how a failed attempt is recorded', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'x\n');
    await editNotesByHand(project, 1, 'foreign\n');
    const seen: string[] = [];
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({
        onCommitFailure: (_context, classified) => {
          seen.push(classified.reason);
          return Promise.resolve('failed');
        },
      }),
      undefined,
      FLUSH,
    );
    expect(seen).toEqual(['content-changed']);
    expect(result).toMatchObject({ status: 'failed' });
  });
});

describe('the batch ids', () => {
  it('names a batch by its first member and refuses to reuse the id of an unfinished record', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    // An unfinished (failed) record under the id of a queued operation: the id is not reused.
    const { withJournalLock } = await import('../../src/specs/durable');
    const { DOCUMENT_BATCH_KIND, publishDocumentBatch } =
      await import('../../src/specs/documents/queue/batch-store');
    const { encodeBatchPaths } = await import('../../src/specs/documents/changes/journal');
    const { writeBatchPaths } = await import('../../src/specs/documents/queue/batch-store');
    const encoded = encodeBatchPaths([
      {
        path: 'specs/active/hand/notes-6.md',
        pre: { sha256: sha256Hex(notesText(6)), bytes: notesText(6).length },
        post: { sha256: sha256Hex('x'), bytes: 1 },
      },
    ]);
    await withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, async () => {
      await writeBatchPaths(project.engine.context, id, encoded);
      await publishDocumentBatch(project.engine.context, {
        version: 1,
        projectId: project.engine.context.project.projectId,
        operationId: id,
        workspaceId: project.workspaceId,
        workspaceRoot: project.root,
        specId: project.specId,
        slug: 'hand',
        state: 'recovery-required',
        memberIds: [id],
        paths: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 1 },
        branch: 'feature/work',
        parentHead: git(project.root, 'rev-parse', 'HEAD'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: 1,
        reason: 'commit-failed',
      });
    });
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
      reason: 'batch-id-collision',
    });
    expect(DOCUMENT_BATCH_RELATIVE_DIR).toBe('engine/operations/documents/batches');
  });
});

describe('the reservation guard sees a claimed batch', () => {
  it('refuses an overlapping save while the batch commits and accepts a disjoint one', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'committing\n');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const hooks: QueueHooks = {
      beforeCommit: async () => {
        reached();
        await gate;
      },
    };
    const running = runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH);
    await atCommit;

    const overlap = await failure(
      applyDocumentChange(
        project.engine,
        project.specId,
        randomUUID(),
        {
          action: 'save',
          documentId: 'notes-1',
          content: 'too soon\n',
          expectedRevision: sha256Hex('committing\n'),
        },
        { busyWaitMs: 0 },
      ),
    );
    expect(overlap).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'commit-in-progress' },
    });
    await applyDocumentChange(
      project.engine,
      project.specId,
      randomUUID(),
      saveNotes(4, 'disjoint\n'),
    );

    // A second run in this process finds the checkout busy and does nothing.
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toEqual({
      status: 'busy',
      reason: 'lease-held',
    });
    release();
    expect(await running).toMatchObject({ status: 'committed' });
  });
});

describe('stops inside the claim (in process)', () => {
  const STOPS: readonly (keyof QueueHooks)[] = [
    'inClaimAfterLease',
    'inClaimAfterRecord',
    'afterMemberClaimed',
  ];

  for (const stop of STOPS) {
    it(`finishes the claim after a stop at ${stop} and commits exactly once`, async () => {
      const project = await queueProject();
      const first = await queueSave(project, 1, 'one\n');
      await queueSave(project, 2, 'two\n');
      const interrupted = new QueueInterrupted();
      const hooks: QueueHooks = {
        [stop]: () => Promise.reject(interrupted),
      };
      await expect(
        runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
      ).rejects.toBe(interrupted);
      expect(engineCommits(project)).toEqual([]);

      // The stopped executor is this very process, idle: the next run takes the claim over.
      const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
      expect(result).toMatchObject({ status: 'committed', batchId: first });
      expect(engineCommits(project)).toHaveLength(1);
      expect(workingTreeClean(project)).toBe(true);
      expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
      expect(currentNotes(project, 2)).toBe('two\n');
    });
  }
});

describe('a commit that exists but was not recorded', () => {
  it('is found by its trailer and completes the members without a second commit', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'a\n');
    const b = await queueSave(project, 2, 'b\n');
    const stop = new QueueInterrupted();
    const hooks: QueueHooks = { afterCommit: () => Promise.reject(stop) };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toBe(stop);
    expect(engineCommits(project)).toHaveLength(1);
    expect((await findDocumentChangeJournal(project.engine.context, a))?.stage).toBe('committing');

    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'committed', resumed: true, operationIds: [a, b] });
    expect(engineCommits(project)).toHaveLength(1);
    expect(await findDocumentChangeJournal(project.engine.context, b)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha: engineCommits(project)[0],
    });
    expect(workingTreeClean(project)).toBe(true);
  });

  it('completes the members from the record when the stop came after the batch was recorded', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'a\n');
    const stop = new QueueInterrupted();
    const hooks: QueueHooks = { afterBatchRecorded: () => Promise.reject(stop) };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toBe(stop);
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    // The batch is already committed: its members follow the record, no Git runs.
    expect(await findDocumentChangeJournal(project.engine.context, a)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
    });
    expect(result.status === 'idle' || result.status === 'committed').toBe(true);
    expect(engineCommits(project)).toHaveLength(1);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('settles members completed before the stop', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'a\n');
    const stop = new QueueInterrupted();
    const hooks: QueueHooks = { afterMembersCompleted: () => Promise.reject(stop) };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toBe(stop);
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
    });
    expect(await findDocumentChangeJournal(project.engine.context, a)).toMatchObject({
      stage: 'completed',
    });
    const { listDocumentChangeJournals } =
      await import('../../src/specs/documents/write/journal-store');
    expect(await listDocumentChangeJournals(project.engine.context)).toEqual([]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(engineCommits(project)).toHaveLength(1);
  });
});

describe('taking over a lease that cannot be proven dead', () => {
  it('is refused without an operator assertion and resumes with one', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'held\n');
    const stop = new QueueInterrupted();
    // An executor on another host: nothing can prove it dead.
    const foreign = { pid: 4242, hostId: 'some-other-host' };
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ executor: foreign, hooks: { afterClaim: () => Promise.reject(stop) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBe(stop);

    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toEqual({
      status: 'busy',
      reason: 'lease-held',
    });
    expect(engineCommits(project)).toEqual([]);

    const resumed = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
      ...FLUSH,
      confirmExecutorStopped: true,
    });
    expect(resumed).toMatchObject({ status: 'committed', resumed: true, operationIds: [id] });
    expect(engineCommits(project)).toHaveLength(1);
  });
});

describe('a commit that carries the trailer but is not the batch', () => {
  it('is not adopted: a forged Nevo-Operation commit of one path leaves the batch for recovery', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    const b = await queueSave(project, 2, 'two\n');
    const stop = new QueueInterrupted();
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterClaim: () => Promise.reject(stop) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBe(stop);

    // Someone commits only notes-1 with the Engine's own committer address and the batch's trailer.
    git(project.root, 'add', `specs/active/hand/${notesPath(1)}`);
    git(
      project.root,
      '-c',
      'user.name=Forger',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '-q',
      '-m',
      'forged',
      '-m',
      `Nevo-Operation: ${a}\nNevo-Kind: document-change`,
    );
    const forged = git(project.root, 'rev-parse', 'HEAD');

    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'failed', outcome: 'recovery-required' });
    for (const id of [a, b]) {
      expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
        stage: 'recovery-required',
        recoveryPhase: 'commit',
      });
    }
    // Nothing was committed on top of the forgery, and notes-2 stays recorded (not silently lost).
    expect(git(project.root, 'rev-parse', 'HEAD')).toBe(forged);
    expect(git(project.root, 'status', '--porcelain')).toContain(notesPath(2));
  });
});

describe('the commit is verified against the recorded content', () => {
  it('sends the batch to recovery when a foreign write landed between the guard and the commit', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'mine\n');
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({
        hooks: { beforeCommit: () => editNotesByHand(project, 1, 'a human typed this\n') },
      }),
      undefined,
      FLUSH,
    );
    expect(result).toMatchObject({ status: 'failed', outcome: 'recovery-required' });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'recovery-required',
      recoveryPhase: 'commit',
      blockedBy: 'commit-content-mismatch',
    });
  });
});

describe('the claim reads its inputs outside the lock and checks them under it', () => {
  it('reads again and includes an operation that was queued after the snapshot', async () => {
    const project = await queueProject();
    const first = await queueSave(project, 1, 'one\n');
    let snapshots = 0;
    let late = '';
    const hooks: QueueHooks = {
      afterSnapshot: async () => {
        snapshots += 1;
        if (snapshots === 1) late = await queueSave(project, 2, 'queued after the snapshot\n');
      },
    };
    const result = await runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH);
    expect(snapshots).toBe(2);
    expect(result).toMatchObject({ status: 'committed', operationIds: [first, late] });
    expect(workingTreeClean(project)).toBe(true);
  });

  it('does not claim an operation whose path a write took over after the snapshot', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'one\n');
    let snapshots = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writing: Promise<unknown> | undefined;
    const hooks: QueueHooks = {
      afterSnapshot: async () => {
        snapshots += 1;
        if (snapshots !== 1) return;
        // A second save of the same document is mid-write when the lock is taken: a barrier.
        let reached!: () => void;
        const atBarrier = new Promise<void>((resolve) => {
          reached = resolve;
        });
        writing = applyDocumentChange(
          project.engine,
          project.specId,
          randomUUID(),
          {
            action: 'save',
            documentId: 'notes-1',
            content: 'two\n',
            expectedRevision: sha256Hex('one\n'),
          },
          {
            hooks: {
              onPathEffect: async (event) => {
                if (event.kind === 'staged') {
                  reached();
                  await hold;
                }
              },
            },
          },
        );
        await atBarrier;
      },
    };
    const result = await runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'idle', reason: 'blocked' });
    expect(engineCommits(project)).toEqual([]);
    release();
    await writing;
  });

  it('carries the failed attempts of the members into the new batch record', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'later\n');
    const lock = join(project.root, '.git', 'index.lock');
    await writeFile(lock, '');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    const { rm } = await import('node:fs/promises');
    await rm(lock);
    let attempts = -1;
    await runQueueOnce(
      project.engine,
      isolatedQueue({
        clock: clockAfterBackoff(),
        hooks: {
          afterClaim: (batch) => {
            attempts = batch.attempts;
            return Promise.resolve();
          },
        },
      }),
      undefined,
      FLUSH,
    );
    expect(attempts).toBe(1);
  });
});

describe('an error that is not a commit failure', () => {
  it('gives the checkout back: the batch is dissolved, the members are queued, nothing is committed twice', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const commits = (await import('../../src/version-control')).openVersionControl(
      project.engine,
    ).commits;
    const broken = {
      ...commits,
      commit: () => Promise.reject(new Error('a bug in the queue')),
    };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ commits: broken }), undefined, FLUSH),
    ).rejects.toThrow('a bug in the queue');
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'queued',
      attempts: 1,
      reason: 'queue-error',
    });
    // Another executor can claim (after the backoff), even though this process is still alive.
    expect(
      await runQueueOnce(
        project.engine,
        isolatedQueue({ clock: clockAfterBackoff() }),
        undefined,
        FLUSH,
      ),
    ).toMatchObject({
      status: 'committed',
      operationIds: [id],
    });
    expect(engineCommits(project)).toHaveLength(1);
  });

  it('releases the lease when the records were already committed, and the members are completed by the next run', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const hooks: QueueHooks = {
      afterBatchRecorded: () => Promise.reject(new Error('the storage failed')),
    };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toThrow('the storage failed');
    expect((await queueRecords(project)).lease).toBe(false);
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
    });
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
    });
    expect(engineCommits(project)).toHaveLength(1);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });
});
