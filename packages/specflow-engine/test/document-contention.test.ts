// Integration (Linux only: independent OS processes, real Git): several processes save documents of
// one Specification and drive the commit queue against the same checkout, round after round. Whatever
// the interleaving, every acknowledged save ends completed (committed, or without a commit when the
// document came back to its committed bytes), no operation is in two commits, no path is in two
// batches, history is linear and the tree is clean. The scheduler and the Close admission of this
// process race the writers.
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from './support/platform';

import { drainQueue } from '../src/specs/documents/queue/worker';
import { createDocumentQueueScheduler } from '../src/specs/documents/scheduler';
import { findDocumentChangeJournal } from '../src/specs/documents/write/journal-store';
import { reserveCloseOperation } from '../src/testing';
import { removeTrackedRoots } from './support/documents-fixture';
import { expectPipelineInvariants, SaveModel } from './support/document-invariants';
import {
  commitCount,
  engineCommits,
  isolatedQueue,
  queueProject,
  type QueueProject,
} from './support/document-queue';
import { GIT_ON } from './support/document-writes';
import {
  reapVitestWorker,
  spawnVitestWorker,
  type IndependentVitestWorker,
} from './support/process-worker';
import { commitStaged, git } from './support/git-project';

const workers: IndependentVitestWorker[] = [];
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await Promise.all(scratch.splice(0).map((path) => rm(path, { force: true })));
  await removeTrackedRoots();
});

interface Outcome {
  readonly acknowledged: { id: string; path: string; content: string }[];
  readonly attempted: { path: string; content: string }[];
  readonly refused: string[];
  readonly unexpected: string[];
  readonly queue: string[];
}

const WORKERS = 6;
const ROUNDS = 6;
const DOCUMENTS = 3;
/** The refusals a writer may get from another one: a stale revision, a busy Specification or project. */
const WRITER_REFUSALS = ['SPEC_BUSY', 'DOCUMENT_REVISION_CONFLICT', 'CONTROL_LOCK_BUSY'];

function spawnContender(project: QueueProject, worker: number, rounds: number) {
  const result = join(tmpdir(), 'contention-' + randomUUID() + '.json');
  scratch.push(result);
  const child = spawnVitestWorker(
    'test/fixtures/document-contention-worker.test.ts',
    {
      NEVO_DOC_CONTENTION: '1',
      NEVO_DOC_CONTENTION_HOME: project.root,
      NEVO_DOC_CONTENTION_DIR: project.dir,
      NEVO_DOC_CONTENTION_SPEC: project.specId,
      NEVO_DOC_CONTENTION_RESULT: result,
      NEVO_DOC_CONTENTION_WORKER: String(worker),
      NEVO_DOC_CONTENTION_ROUNDS: String(rounds),
      NEVO_DOC_CONTENTION_DOCUMENTS: String(DOCUMENTS),
    },
    240000,
  );
  workers.push(child);
  return { child, result };
}

type Contender = ReturnType<typeof spawnContender>;

async function collect(contenders: readonly Contender[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const { child, result } of contenders) {
    const done = await child.done;
    expect(done.code, done.log).toBe(0);
    outcomes.push(JSON.parse(await readFile(result, 'utf8')) as Outcome);
  }
  return outcomes;
}

function modelOf(outcomes: readonly Outcome[]): SaveModel {
  const model = new SaveModel();
  for (const outcome of outcomes) {
    for (const attempt of outcome.attempted) model.attempt(attempt.path, attempt.content);
    for (const save of outcome.acknowledged) model.acknowledge(save.id, save.path, save.content);
  }
  return model;
}

/** What must hold when every writer is gone and the queue was drained once more. */
async function expectSettled(project: QueueProject, outcomes: readonly Outcome[]): Promise<void> {
  for (const outcome of outcomes) {
    expect(outcome.unexpected).toEqual([]);
    for (const code of outcome.refused) expect(WRITER_REFUSALS).toContain(code);
  }
  for (let pass = 0; pass < 3; pass += 1) {
    await drainQueue(project.engine, isolatedQueue(), undefined, { flush: true });
  }
  await expectPipelineInvariants(project, modelOf(outcomes), 'drained');
  // History is a line: no merge came from the commits of the processes.
  expect(git(project.root, 'rev-list', '--merges', '--count', 'HEAD')).toBe('0');
}

describe.skipIf(!onLinux)('independent processes writing and committing at once', () => {
  it(`${WORKERS} processes x ${ROUNDS} rounds: no duplicate, no path in two batches, a clean tree`, async () => {
    const project = await queueProject();
    const before = commitCount(project);
    const contenders = Array.from({ length: WORKERS }, (_, worker) =>
      spawnContender(project, worker, ROUNDS),
    );
    const outcomes = await collect(contenders);

    const acknowledged = outcomes.flatMap((outcome) => outcome.acknowledged);
    expect(acknowledged.length).toBeGreaterThan(WORKERS);
    await expectSettled(project, outcomes);
    expect(commitCount(project) - before).toBe(engineCommits(project).length);
  }, 420000);

  it('a scheduler of this process races the writers and ends with the same state', async () => {
    const project = await queueProject();
    const scheduler = createDocumentQueueScheduler(project.engine, {});
    await scheduler.start();
    const contenders = Array.from({ length: 3 }, (_, worker) => spawnContender(project, worker, 4));
    const outcomes = await collect(contenders);
    const stopped = await scheduler.stop({ flush: true, deadlineMs: 60000 });
    expect(stopped.timedOut).toBe(false);
    await expectSettled(project, outcomes);
  }, 420000);
});

describe.skipIf(!onLinux)('Close racing the writers', () => {
  it('is admitted only with nothing pending: every acknowledged save is completed and committed', async () => {
    const project = await queueProject();
    const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(project.root, 'add', '.nevo/config.yaml');
    commitStaged(project.root, 'pin the integration target');

    const contenders = Array.from({ length: 3 }, (_, worker) => spawnContender(project, worker, 8));
    const closeId = randomUUID();
    const request = {
      kind: 'specification-close' as const,
      operationId: closeId,
      specId: project.specId,
    };
    // Close is asked for while the writers run; every answer is one of the documented refusals or the
    // admission, which holds the checkout from then on (later saves meet the claim conflict).
    let admitted = false;
    let writing = true;
    void Promise.all(contenders.map(({ child }) => child.done)).then(() => {
      writing = false;
    });
    while (!admitted && writing) {
      try {
        await reserveCloseOperation(project.engine, request, { flush: { queue: isolatedQueue() } });
        admitted = true;
      } catch (error) {
        expect([
          'CLOSE_CONFLICT',
          'CLOSE_PREFLIGHT',
          'DOCUMENT_COMMITS_PENDING',
          'SPEC_BUSY',
          'CONTROL_LOCK_BUSY',
        ]).toContain((error as { code?: string }).code);
      }
    }
    const outcomes = await collect(contenders);
    for (const outcome of outcomes) expect(outcome.unexpected).toEqual([]);
    if (!admitted) {
      // The writers were done first: the Close finds nothing pending and is admitted.
      await reserveCloseOperation(project.engine, request, { flush: { queue: isolatedQueue() } });
    }
    for (let pass = 0; pass < 3; pass += 1) {
      await drainQueue(project.engine, isolatedQueue(), undefined, { flush: true });
    }
    // Whatever slipped in before the admission is committed; nothing of any save is left pending.
    for (const id of modelOf(outcomes).acknowledged) {
      expect((await findDocumentChangeJournal(project.engine.context, id))?.stage).toBe(
        'completed',
      );
    }
    expect(git(project.root, 'status', '--porcelain', '--', 'specs')).toBe('');
  }, 420000);
});
