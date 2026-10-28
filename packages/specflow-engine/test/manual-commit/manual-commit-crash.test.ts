// Integration (Linux only: real SIGKILL, /proc dead proof): the cut points of the manual commit
// (ADR 0018 decision 8). The process is killed after the reservation, inside the claim, inside
// `git commit` with a hung filter, after the commit, and after the ledger prune; the same operation id
// then finishes the work once. A process that holds the lease keeps the queue out, and the queue takes
// the lease over when that process is gone.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import { inspectProjectControlLock } from '../../src/project/control-lock';
import { DocumentError } from '../../src/specs/document-rules/errors';
import { readQueueLease } from '../../src/specs/documents/queue/lease';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { takeOverDocumentQueue } from '../../src/specs/documents/scheduler';
import { listManualCommitJournals } from '../../src/specs/manual-commit';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import { checkoutClaimFree, ledgerPaths, setLocalAutoCommit } from '../support/document-writes';
import {
  commitCount,
  engineCommits,
  isolatedQueue,
  queueSave,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import { git } from '../support/git-project';
import {
  commitUncommitted,
  headCount,
  journalOf,
  manualCommits,
  manualModeProject,
  saveUncommitted,
  specPath,
} from '../support/manual-commit';
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

const MESSAGE = 'Committed by a process that is killed';

function spawnManualWorker(project: QueueProject, cut: string, operationId: string) {
  // Outside the checkout: the working tree is asserted clean.
  const signal = join(tmpdir(), 'manual-commit-cut-' + randomUUID() + '.checkpoint');
  scratch.push(signal);
  const worker = spawnVitestWorker(
    'test/fixtures/manual-commit-worker.test.ts',
    {
      NEVO_MANUAL_COMMIT_WORKER: '1',
      NEVO_MANUAL_COMMIT_WORKER_HOME: project.root,
      NEVO_MANUAL_COMMIT_WORKER_SIGNAL: signal,
      NEVO_MANUAL_COMMIT_WORKER_CUT: cut,
      NEVO_MANUAL_COMMIT_WORKER_SPEC: project.specId,
      NEVO_MANUAL_COMMIT_WORKER_OPERATION: operationId,
    },
    60000,
  );
  workers.push(worker);
  return { signal, worker };
}

/** Starts the worker, waits for its cut and kills the process that reached it. */
async function killAt(project: QueueProject, cut: string, operationId: string) {
  const { signal, worker } = spawnManualWorker(project, cut, operationId);
  await awaitProcessMarker(signal, worker, 45000, 30);
  const checkpoint = await readProcessCheckpoint(signal, cut);
  await terminateCheckpointPid(checkpoint.pid, worker);
  return checkpoint;
}

/** Two uncommitted notes the manual commit is about. */
async function twoUncommitted(project: QueueProject): Promise<void> {
  await saveUncommitted(project, 1, 'one\n');
  await saveUncommitted(project, 2, 'two\n');
}

/** The work was finished once: one commit of the manual kind, nothing left over. */
async function expectFinishedOnce(project: QueueProject, before: number): Promise<void> {
  expect(headCount(project)).toBe(before + 1);
  expect(manualCommits(project)).toHaveLength(1);
  expect(git(project.root, 'log', '-1', '--format=%H')).toBe(manualCommits(project)[0]);
  expect(await ledgerPaths(project)).toEqual([]);
  expect(workingTreeClean(project)).toBe(true);
  expect((await readQueueLease(project.engine.context, project.workspaceId)) === undefined).toBe(
    true,
  );
  expect(await checkoutClaimFree(project)).toBe(true);
  expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
  expect(engineCommits(project)).toEqual([]);
}

describe.skipIf(!onLinux)('a manual commit killed outside the control lock', () => {
  it('after the reservation: the journal waits and the same operation id commits once', async () => {
    const project = await manualModeProject();
    await twoUncommitted(project);
    const before = headCount(project);
    const operationId = randomUUID();

    await killAt(project, 'after-reserved', operationId);

    expect((await journalOf(project, operationId))?.stage).toBe('reserved');
    expect(headCount(project)).toBe(before);
    expect(await readQueueLease(project.engine.context, project.workspaceId)).toBeUndefined();
    // The reservation holds the checkout and the paths.
    expect(await checkoutClaimFree(project)).toBe(false);
    expect(await failure(saveUncommitted(project, 1, 'racing\n'))).toBeInstanceOf(DocumentError);

    const result = await commitUncommitted(project, { operationId, message: MESSAGE });

    expect(result.commit.state).toBe('committed');
    await expectFinishedOnce(project, before);
  }, 180000);

  it('after the commit: the replay finds the commit by its trailer and does not make another', async () => {
    const project = await manualModeProject();
    await twoUncommitted(project);
    const before = headCount(project);
    const operationId = randomUUID();

    await killAt(project, 'after-commit', operationId);

    // The commit exists; the journal still says committing and the ledger still lists the paths.
    expect(headCount(project)).toBe(before + 1);
    expect(await journalOf(project, operationId)).toMatchObject({ stage: 'committing' });
    expect((await journalOf(project, operationId))?.commitStartedAt).toBeDefined();
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    const lease = await readQueueLease(project.engine.context, project.workspaceId);
    expect(lease?.batchId).toBe(operationId);

    const result = await commitUncommitted(project, { operationId, message: MESSAGE });

    expect(result.paths).toEqual([specPath(1), specPath(2)]);
    await expectFinishedOnce(project, before);
  }, 180000);

  it('after the ledger prune: the journal that is not completed is completed by the replay', async () => {
    const project = await manualModeProject();
    await twoUncommitted(project);
    const before = headCount(project);
    const operationId = randomUUID();

    await killAt(project, 'after-ledger-pruned', operationId);

    expect(headCount(project)).toBe(before + 1);
    expect(await ledgerPaths(project)).toEqual([]);
    expect((await journalOf(project, operationId))?.stage).toBe('committing');

    const result = await commitUncommitted(project, { operationId, message: MESSAGE });

    expect(result.commit.state).toBe('committed');
    await expectFinishedOnce(project, before);
  }, 180000);

  it('a repeat of another body, or by another operation id, is not the replay', async () => {
    const project = await manualModeProject();
    await twoUncommitted(project);
    const operationId = randomUUID();
    await killAt(project, 'after-commit', operationId);

    expect(
      await failure(commitUncommitted(project, { operationId, message: 'A different message' })),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_CONFLICT' });
    // Another operation id finds the paths held by the stopped commit and waits for its operator.
    expect(await failure(commitUncommitted(project))).toMatchObject({
      code: 'SPEC_BUSY',
    });
  }, 180000);
});

describe.skipIf(!onLinux)('a manual commit killed inside the control lock', () => {
  it('inside the claim: the lock stays held by the dead process until the takeover; then it is finished once', async () => {
    const project = await manualModeProject();
    await twoUncommitted(project);
    const before = headCount(project);
    const operationId = randomUUID();

    const checkpoint = await killAt(project, 'in-claim-after-lease', operationId);

    // The lease is written, the journal still says reserved, the control lock is held by a dead process.
    expect(await inspectProjectControlLock(project.engine.context)).toMatchObject({
      status: 'held',
      pid: checkpoint.pid,
    });
    expect(headCount(project)).toBe(before);

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: isolatedQueue(),
    });
    expect(taken.lock.status).toBe('cleared');
    // The takeover resumes the manual commit the dead process left holding the checkout.
    expect(taken.manualCommits).toEqual([{ operationId, outcome: 'resumed' }]);
    expect((await journalOf(project, operationId))?.stage).toBe('completed');

    const result = await commitUncommitted(project, { operationId, message: MESSAGE });

    expect(result.commit.state).toBe('committed');
    await expectFinishedOnce(project, before);
  }, 180000);
});

describe.skipIf(!onLinux)('a manual commit killed inside git with a hung filter', () => {
  /** A clean filter that hangs while the flag exists and Git holds `index.lock`: inside the mutation. */
  async function hungFilter(project: QueueProject) {
    const gitDir = join(project.root, '.git');
    const flag = join(gitDir, 'hang-flag');
    const groupFile = join(gitDir, 'filter.group');
    const script = join(gitDir, 'hang-clean.sh');
    await writeFile(
      script,
      [
        `if [ -e "${flag}" ] && [ -e "${gitDir}/index.lock" ]; then`,
        `  ps -o pgid= -p $$ | tr -d ' ' > "${groupFile}.tmp"; mv "${groupFile}.tmp" "${groupFile}"`,
        '  sleep 600 & wait',
        'fi',
        'cat',
        '',
      ].join('\n'),
    );
    git(project.root, 'config', 'filter.hang.clean', `sh "${script}"`);
    await writeFile(join(project.dir, '.gitattributes'), '*.md filter=hang\n');
    git(project.root, 'add', '--', 'specs');
    git(
      project.root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'filter',
    );
    return { flag, groupFile };
  }

  it('leaves an orphan index.lock; nothing is committed, the ledger is intact and a new operation commits once', async () => {
    const project = await manualModeProject();
    const filter = await hungFilter(project);
    await twoUncommitted(project);
    const before = headCount(project);
    const operationId = randomUUID();
    await writeFile(filter.flag, '');

    const { signal, worker } = spawnManualWorker(project, 'announce-before-commit', operationId);
    await awaitProcessMarker(filter.groupFile, worker, 60000, 30);
    const runner = await readProcessCheckpoint(signal, 'announced');
    const group = Number((await readFile(filter.groupFile, 'utf8')).trim());
    expect(Number.isSafeInteger(group) && group > 1).toBe(true);
    expect(group).not.toBe(
      Number(
        execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim(),
      ),
    );
    // The runner first (it would record the failure of Git), then the group of Git and its filter.
    process.kill(runner.pid, 'SIGKILL');
    await worker.done;
    process.kill(-group, 'SIGKILL');
    await rm(signal, { force: true });
    await rm(filter.flag);

    // The orphan lock is the blocker; the commit never happened, the journal says it was started.
    expect(
      await readFile(join(project.root, '.git', 'index.lock'), 'utf8').then(
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(await journalOf(project, operationId)).toMatchObject({ stage: 'committing' });
    expect((await journalOf(project, operationId))?.commitStartedAt).toBeDefined();

    // A repeat meets the lock: the port's blocker is a refusal, the journal ends failed, nothing is lost.
    expect(
      await failure(commitUncommitted(project, { operationId, message: MESSAGE })),
    ).toMatchObject({ code: 'COMMIT_BLOCKED', details: { blockedBy: 'index-locked' } });
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'failed',
      reason: 'index-locked',
    });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await readQueueLease(project.engine.context, project.workspaceId)).toBeUndefined();

    // The person removes the lock and asks again with a new operation id.
    await rm(join(project.root, '.git', 'index.lock'));
    await commitUncommitted(project, { message: MESSAGE });
    await expectFinishedOnce(project, before);
  }, 240000);
});

describe.skipIf(!onLinux)(
  'a manual commit and the document queue never run in a checkout at once',
  () => {
    it('keeps the queue out while a live process holds the lease and lets it take over a dead one', async () => {
      const project = await manualModeProject();
      await saveUncommitted(project, 1, 'one\n');
      const before = headCount(project);
      const operationId = randomUUID();
      const { signal, worker } = spawnManualWorker(project, 'after-claim', operationId);
      await awaitProcessMarker(signal, worker, 45000, 30);
      const checkpoint = await readProcessCheckpoint(signal, 'after-claim');

      // The policy is on again: a save is queued while the manual commit holds the checkout.
      await setLocalAutoCommit(project, true);
      await queueSave(project, 2, 'queued\n');
      const lease = await readQueueLease(project.engine.context, project.workspaceId);
      expect(lease).toMatchObject({ batchId: operationId, executor: { pid: checkpoint.pid } });

      const blocked = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
        flush: true,
      });
      expect(blocked).toEqual({ status: 'busy', reason: 'lease-held' });
      expect(commitCount(project)).toBe(before);

      // The holder dies. The queue proves it dead, takes the lease and commits its own batch; the manual
      // commit is finished afterwards by its operation id, and each commit holds only its own paths.
      await terminateCheckpointPid(checkpoint.pid, worker);
      const drained = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
        flush: true,
      });
      expect(drained.status).toBe('committed');
      expect(commitCount(project)).toBe(before + 1);
      expect(git(project.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe(
        specPath(2),
      );

      const result = await commitUncommitted(project, { operationId, message: MESSAGE });

      expect(result.paths).toEqual([specPath(1)]);
      expect(headCount(project)).toBe(before + 2);
      expect(git(project.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe(
        specPath(1),
      );
      expect(await ledgerPaths(project)).toEqual([]);
      expect(workingTreeClean(project)).toBe(true);
      expect(await readQueueLease(project.engine.context, project.workspaceId)).toBeUndefined();
    }, 240000);
  },
);
