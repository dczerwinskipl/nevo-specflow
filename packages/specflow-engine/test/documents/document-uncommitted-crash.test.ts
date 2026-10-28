// Integration (Linux only: real SIGKILL, /proc dead proof): the cut points of the uncommitted
// completion (ADR 0018): the ledger holds the paths of a write made with auto-commit off and its
// journal is not completed; a batch is committed and completed but the ledger was not pruned;
// an abandon wrote the ledger and was killed before it completed the operation. After each one the
// work is finished exactly once: the ledger holds every uncommitted path once, nothing is committed that
// the policy forbids, and no operation is listed twice.
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import { sha256Hex } from '../../src/hash';
import { inspectProjectControlLock } from '../../src/project/control-lock';
import { applyDocumentChange } from '../../src/specs/documents/api';
import type { DocumentChangeRequest } from '../../src/specs/documents/changes/plan/request';
import { abandonDocumentCommit } from '../../src/specs/documents/queue/actions';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { takeOverDocumentQueue } from '../../src/specs/documents/scheduler';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { pruneUncommitted } from '../../src/specs/uncommitted';
import { removeTrackedRoots } from '../support/documents-fixture';
import { expectPipelineInvariants, SaveModel } from '../support/document-invariants';
import {
  commitCount,
  editNotesByHand,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueSave,
} from '../support/document-queue';
import {
  checkoutClaimFree,
  ledgerOf,
  ledgerPaths,
  notesPath,
  notesRevision,
  setLocalAutoCommit,
} from '../support/document-writes';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
  type IndependentVitestWorker,
} from '../support/process-worker';

const workers: IndependentVitestWorker[] = [];
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await removeTrackedRoots();
});

const specPath = (index: number): string => `specs/active/hand/${notesPath(index)}`;
const FLUSH = { flush: true } as const;

/** A signal file outside the checkout: the working tree is asserted clean. */
function signalFile(): string {
  const signal = join(tmpdir(), 'uncommitted-cut-' + randomUUID() + '.checkpoint');
  scratch.push(signal);
  return signal;
}

describe.skipIf(!onLinux)('a writer with auto-commit off killed after the ledger write', () => {
  it('leaves the ledger entry and an unfinished journal; the same operation id completes it once', async () => {
    const project = await queueProject();
    await setLocalAutoCommit(project, false);
    const model = new SaveModel();
    const operationId = randomUUID();
    const request: DocumentChangeRequest = {
      action: 'save',
      documentId: 'notes-1',
      content: 'killed after the ledger\n',
      expectedRevision: notesRevision(1),
    };
    model.acknowledge(operationId, notesPath(1), 'killed after the ledger\n');
    const signal = signalFile();
    const worker = spawnVitestWorker(
      'test/fixtures/crash-document-worker.test.ts',
      {
        NEVO_DOCUMENT_CRASH_WORKER: '1',
        NEVO_DOCUMENT_CRASH_HOME: project.root,
        NEVO_DOCUMENT_CRASH_SIGNAL: signal,
        NEVO_DOCUMENT_CRASH_CUT: 'after-ledger-write',
        NEVO_DOCUMENT_CRASH_MODE: 'write',
        NEVO_DOCUMENT_CRASH_LAST_INDEX: '0',
        NEVO_DOCUMENT_CRASH_REQUEST: JSON.stringify(request),
        NEVO_DOCUMENT_CRASH_SPEC: project.specId,
        NEVO_DOCUMENT_CRASH_OPERATION: operationId,
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'after-ledger-write');
    await terminateCheckpointPid(checkpoint.pid, worker);

    // The cut: the ledger already holds the path, the journal is not completed, the claim is held.
    expect((await ledgerOf(project))?.entries).toMatchObject([
      { path: specPath(1), operationIds: [operationId], operationCount: 1 },
    ]);
    expect(await findDocumentChangeJournal(project.engine.context, operationId)).toMatchObject({
      stage: 'files-writing',
      commitMode: 'manual',
    });
    expect(await checkoutClaimFree(project)).toBe(false);
    // The kill happened inside the control lock: it stays until the operator takeover clears it.
    expect(await inspectProjectControlLock(project.engine.context)).toMatchObject({
      status: 'held',
      pid: checkpoint.pid,
    });
    await expectPipelineInvariants(project, model, 'stopped');

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: isolatedQueue(),
    });
    expect(taken.lock.status).toBe('cleared');
    expect(taken.writes).toEqual([{ operationId, outcome: 'resumed' }]);
    expect(await findDocumentChangeJournal(project.engine.context, operationId)).toMatchObject({
      stage: 'completed',
      outcome: 'uncommitted',
      reason: 'auto-commit-off',
    });
    // Nothing doubled: the replay added no second operation to the entry.
    expect((await ledgerOf(project))?.entries).toMatchObject([
      { path: specPath(1), operationIds: [operationId], operationCount: 1 },
    ]);
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(engineCommits(project)).toEqual([]);
    await expectPipelineInvariants(project, model, 'stopped');
  }, 120000);
});

describe.skipIf(!onLinux)('a batch committed and completed, the ledger not pruned yet', () => {
  it('keeps the entry until the next prune, which removes it once', async () => {
    const project = await queueProject();
    await setLocalAutoCommit(project, false);
    // An uncommitted write, then the policy turns on and the same document is saved again.
    const first = randomUUID();
    await applyDocumentChange(project.engine, project.specId, first, {
      action: 'save',
      documentId: 'notes-1',
      content: 'left uncommitted\n',
      expectedRevision: notesRevision(1),
    });
    project.content.set(`${project.specId}:1`, 'left uncommitted\n');
    await setLocalAutoCommit(project, true);
    const second = await queueSave(project, 1, 'saved automatically\n');
    const before = commitCount(project);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);

    const signal = signalFile();
    const worker = spawnVitestWorker(
      'test/fixtures/queue-worker.test.ts',
      {
        NEVO_QUEUE_WORKER: '1',
        NEVO_QUEUE_WORKER_HOME: project.root,
        NEVO_QUEUE_WORKER_SIGNAL: signal,
        NEVO_QUEUE_WORKER_CUT: 'after-members-completed',
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'after-members-completed');
    await terminateCheckpointPid(checkpoint.pid, worker);

    // The commit exists and the operation is completed; the ledger still names a path HEAD holds.
    expect(commitCount(project)).toBe(before + 1);
    expect(await findDocumentChangeJournal(project.engine.context, second)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
    });
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    await expectPipelineInvariants(project, undefined, 'stopped');

    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 1, remaining: 0 });
    expect(await ledgerOf(project)).toBeUndefined();
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 0, remaining: 0 });
    // The recovery pass of the queue has nothing left to do and commits nothing more.
    const idle = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(idle.status).toBe('idle');
    expect(commitCount(project)).toBe(before + 1);
  }, 120000);
});

describe.skipIf(!onLinux)('an abandon killed between the ledger write and the completion', () => {
  it('is finished by a repeat of the abandon: one entry, one completion, the claim released', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'mine\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect((await findDocumentChangeJournal(project.engine.context, id))?.stage).toBe(
      'commit-failed',
    );

    const signal = signalFile();
    const worker = spawnVitestWorker(
      'test/fixtures/abandon-worker.test.ts',
      {
        NEVO_ABANDON_WORKER: '1',
        NEVO_ABANDON_WORKER_HOME: project.root,
        NEVO_ABANDON_WORKER_SIGNAL: signal,
        NEVO_ABANDON_WORKER_OPERATION: id,
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'after-ledger-write');
    await terminateCheckpointPid(checkpoint.pid, worker);

    // The cut: the ledger has the path, the operation still fails its commit and holds the claim.
    expect((await ledgerOf(project))?.entries).toMatchObject([
      { path: specPath(1), operationIds: [id], reason: 'abandoned' },
    ]);
    expect((await findDocumentChangeJournal(project.engine.context, id))?.stage).toBe(
      'commit-failed',
    );
    expect(await checkoutClaimFree(project)).toBe(false);
    await expectPipelineInvariants(project, undefined, 'stopped');

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: isolatedQueue(),
    });
    expect(taken.lock.status).toBe('cleared');
    const abandoned = await abandonDocumentCommit(project.engine, id);
    expect(abandoned.map((journal) => [journal.stage, journal.outcome, journal.reason])).toEqual([
      ['completed', 'uncommitted', 'abandoned'],
    ]);
    const entries = (await ledgerOf(project))?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operationIds: [id],
      operationCount: 1,
      postSha256: sha256Hex('mine\n'),
    });
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(engineCommits(project)).toEqual([]);
    await expectPipelineInvariants(project, undefined, 'stopped');
  }, 120000);
});
