// Integration (real project, real Git): operations that wait for a decision and the edges around
// them. Attempts counted per member, an operation whose plan cannot be read, the caps of what waits
// for a person, a repeated action, a failure recorded by an executor that no longer holds the batch,
// the locks of recording a commit and an uncertain outcome of a Git process that may still run.
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { GitCapabilityError } from '../src/git/errors';
import { sha256Hex } from '../src/hash';
import { applyDocumentChange } from '../src/specs/documents/api';
import type { DocumentBatchRecord } from '../src/specs/documents/changes/journal';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../src/specs/documents/changes/journal/kind';
import { buildJournal } from '../src/specs/documents/changes/test-support';
import { abandonDocumentCommit, retryDocumentCommit } from '../src/specs/documents/queue/actions';
import { recordCommitFailure } from '../src/specs/documents/queue/failure';
import type { QueueHooks } from '../src/specs/documents/queue/types';
import { drainQueue, runQueueOnce } from '../src/specs/documents/queue/worker';
import { findDocumentChangeJournal } from '../src/specs/documents/write/journal-store';
import { publishJournal, withJournalLock } from '../src/specs/durable';
import { openVersionControl } from '../src/version-control';
import { failure, removeTrackedRoots } from './support/documents-fixture';
import { notesText } from './support/document-writes';
import {
  clockAfterBackoff,
  editNotesByHand,
  isolatedQueue,
  manualClock,
  queueProject,
  queueRecords,
  queueSave,
  type QueueProject,
} from './support/document-queue';

afterEach(removeTrackedRoots);

const FLUSH = { flush: true } as const;

const stage = (project: QueueProject, id: string) =>
  findDocumentChangeJournal(project.engine.context, id);

function settleQueue(project: QueueProject) {
  return drainQueue(
    project.engine,
    isolatedQueue({ clock: clockAfterBackoff() }),
    undefined,
    FLUSH,
  );
}

describe('attempts are counted per member', () => {
  it('gives a save that joins a batch of tired members its own full set of attempts', async () => {
    const project = await queueProject();
    const tired = await queueSave(project, 1, 'tired\n');
    const lock = join(project.root, '.git', 'index.lock');
    await writeFile(lock, '');
    let at = Date.now() + 1000;
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const clock = manualClock();
      clock.wallAt(at);
      await runQueueOnce(project.engine, isolatedQueue({ clock }), undefined, FLUSH);
      at += 120_000;
    }
    expect((await stage(project, tired))?.attempts).toBe(9);

    // A save is admitted only while Git can take a commit; the blocker is back for the next attempt.
    await rm(lock);
    const fresh = await queueSave(project, 2, 'fresh\n');
    await writeFile(lock, '');
    let batchAttempts = -1;
    const clock = manualClock();
    clock.wallAt(at);
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({
        clock,
        hooks: {
          afterClaim: (batch) => {
            batchAttempts = batch.attempts;
            return Promise.resolve();
          },
        },
      }),
      undefined,
      FLUSH,
    );
    // One more failed attempt does not end the retries of the save that has just arrived.
    expect(batchAttempts).toBe(0);
    expect(result).toMatchObject({ status: 'failed', outcome: 'requeued' });
    expect(await stage(project, tired)).toMatchObject({ stage: 'queued', attempts: 10 });
    expect(await stage(project, fresh)).toMatchObject({ stage: 'queued', attempts: 1 });
  });
});

describe('an operation whose plan cannot be read', () => {
  async function fabricate(project: QueueProject, stageName: 'queued' | 'files-writing') {
    const context = project.engine.context;
    const id = randomUUID();
    await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, () =>
      publishJournal(
        context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        buildJournal(stageName, {
          projectId: context.project.projectId,
          operationId: id,
          specId: project.specId,
          workspaceId: project.workspaceId,
          workspaceRoot: project.root,
          sequence: 9000,
          commit: { branch: 'feature/work' },
        }),
      ),
    );
    return id;
  }

  it('is failed alone and does not wedge the checkout', async () => {
    const project = await queueProject();
    const broken = await fabricate(project, 'queued');
    const good = await queueSave(project, 1, 'one\n');
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [good] });
    expect(await stage(project, broken)).toMatchObject({
      stage: 'commit-failed',
      reason: 'plan-invalid',
    });
  });

  it('holds back the queue without throwing when it is a write whose paths are unknown', async () => {
    const project = await queueProject();
    await fabricate(project, 'files-writing');
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result.status).toBe('idle');
  });
});

describe('what waits for a person', () => {
  it('has its own refusal when too many wait', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    const fabricate = async (stageName: 'commit-failed', count: number, base: number) => {
      await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
        for (let index = 0; index < count; index += 1) {
          const n = base + index;
          await publishJournal(
            context,
            DOCUMENT_CHANGE_JOURNAL_KIND,
            buildJournal(stageName, {
              projectId: context.project.projectId,
              operationId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
              specId: project.specId,
              workspaceId: project.workspaceId,
              workspaceRoot: project.root,
              sequence: n,
              batchId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
            }),
          );
        }
      });
    };
    await fabricate('commit-failed', 999, 5000);
    // 999 operations wait for a decision: still room for one more.
    await queueSave(project, 1, 'accepted\n');
    const refused = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), {
        action: 'save',
        documentId: 'notes-2',
        content: 'one too many\n',
        expectedRevision: sha256Hex(notesText(2)),
      }),
    );
    expect(refused).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'held-limit' } });
    expect(
      (refused as { details?: { retryAfterMs?: number } }).details?.retryAfterMs,
    ).toBeUndefined();
  }, 300_000);
});

describe('repeating an action', () => {
  async function failedOperation(project: QueueProject): Promise<string> {
    const id = await queueSave(project, 1, 'mine\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    return id;
  }

  it('answers with where the operation is when the same action ran before', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    const first = await abandonDocumentCommit(project.engine, id);
    const again = await abandonDocumentCommit(project.engine, id);
    expect(again.map((journal) => [journal.stage, journal.outcome])).toEqual([
      ['completed', 'uncommitted'],
    ]);
    expect(again[0]?.operationId).toBe(first[0]?.operationId);
  });

  it('answers a repeated retry with the operation on its way', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    await editNotesByHand(project, 1, 'mine\n');
    await retryDocumentCommit(project.engine, id);
    expect((await retryDocumentCommit(project.engine, id)).map((j) => j.stage)).toEqual(['queued']);
    await settleQueue(project);
    expect((await retryDocumentCommit(project.engine, id)).map((j) => j.stage)).toEqual([
      'completed',
    ]);
  });

  it('still refuses an action that conflicts with where the operation is', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'queued\n');
    expect(await failure(abandonDocumentCommit(project.engine, id))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
  });
});

describe('a failure recorded by an executor that no longer holds the batch', () => {
  it('is refused: it cannot publish a failed batch over one that was committed and removed', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'one\n');
    let claimed: DocumentBatchRecord | undefined;
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({
        hooks: {
          afterClaim: (batch) => {
            claimed = batch;
            return Promise.resolve();
          },
        },
      }),
      undefined,
      FLUSH,
    );
    expect(result.status).toBe('committed');
    // The batch is committed and gone. A slow executor now reports a failure for it.
    const stale = recordCommitFailure(
      {
        context: project.engine.context,
        batch: claimed!,
        executor: claimed!.executor!,
        now: () => new Date().toISOString(),
      },
      { kind: 'transient', reason: 'index-locked' },
    );
    await expect(stale).rejects.toMatchObject({ code: 'DOCUMENT_OPERATION_STATE_INVALID' });
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });
});

describe('the locks of recording a commit', () => {
  it('takes one short section per member, not one long one for the whole batch', async () => {
    const project = await queueProject();
    for (let index = 1; index <= 6; index += 1) await queueSave(project, index, `doc ${index}\n`);
    let sections = 0;
    const listener = (): void => {
      sections += 1;
    };
    const hooks: QueueHooks = {
      afterBatchRecorded: () => {
        subscribe('nevo.specflow.engine.control-lock', listener);
        return Promise.resolve();
      },
      afterMembersCompleted: () => {
        unsubscribe('nevo.specflow.engine.control-lock', listener);
        return Promise.resolve();
      },
    };
    const result = await runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'committed' });
    expect(sections).toBeGreaterThanOrEqual(6);
  });
});

describe('an uncertain outcome of a Git process that may still run', () => {
  it('is not retried: absence of a commit proves nothing while Git may still be writing', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const real = openVersionControl(project.engine).commits;
    const running = (): GitCapabilityError =>
      new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'uncertain', 'not-terminated');
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({ commits: { ...real, commit: () => Promise.reject(running()) } }),
      undefined,
      FLUSH,
    );
    expect(result).toMatchObject({ status: 'failed', outcome: 'recovery-required' });
    expect(await stage(project, id)).toMatchObject({
      stage: 'recovery-required',
      blockedBy: 'not-terminated',
    });
  });
});
