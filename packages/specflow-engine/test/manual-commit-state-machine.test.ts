// Integration (Linux; real project, real Git; no process is killed): a simulation of the whole life of
// a manual commit with a stop at EVERY durable step of a run that reserves, claims the lease, commits,
// prunes the ledger, completes and settles. After the stop the process is "dead": every later write
// fails until the test brings the client back, exactly as in a process that was killed. Then, before
// anything recovers it, the invariants of any instant hold (the ledger holds both paths or none and
// never loses a path before the commit exists; at most one commit); then the client repeats the
// request with its operation id and the end state is the one without the stop: one commit, the ledger
// empty, the claim and the lease released, a clean tree.
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { onLinux } from './support/platform';

import { QueueInterrupted } from '../src/specs/documents/queue/types';
import { readQueueLease } from '../src/specs/documents/queue/lease';
import { listManualCommitJournals } from '../src/specs/manual-commit';
import { removeTrackedRoots } from './support/documents-fixture';
import { checkoutClaimFree, ledgerPaths } from './support/document-writes';
import { workingTreeClean, type QueueProject } from './support/document-queue';
import { git } from './support/git-project';
import {
  commitUncommitted,
  headCount,
  manualCommits,
  manualModeProject,
  saveUncommitted,
  specPath,
} from './support/manual-commit';

const control = vi.hoisted(
  (): {
    armed: boolean;
    count: number;
    failAt: number;
    dead: boolean;
    mode: 'record' | 'rename';
  } => ({
    armed: false,
    count: 0,
    failAt: 0,
    dead: false,
    /** What is counted: whole record publishes (journals, leases, the ledger) or every rename of any durable file. */
    mode: 'record',
  }),
);

/** The next durable step of the run; the process is dead from the chosen one on. */
function durableStep(kind: 'record' | 'rename'): void {
  if (!control.armed) return;
  if (control.mode === kind) {
    control.count += 1;
    if (control.count === control.failAt) control.dead = true;
  }
  if (control.dead) throw new QueueInterrupted('a durable step');
}

vi.mock('../src/project/fs/atomic-json', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/project/fs/atomic-json')>();
  return {
    ...original,
    writeJsonAtomically: async (...args: Parameters<typeof original.writeJsonAtomically>) => {
      durableStep('record');
      return original.writeJsonAtomically(...args);
    },
  };
});

vi.mock('../src/project/fs/windows-safe-fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/project/fs/windows-safe-fs')>();
  return {
    ...original,
    renameWindowsSafe: (...args: Parameters<typeof original.renameWindowsSafe>) => {
      durableStep('rename');
      return original.renameWindowsSafe(...args);
    },
  };
});

afterEach(async () => {
  control.armed = false;
  control.dead = false;
  control.mode = 'record';
  await removeTrackedRoots();
});

const MESSAGE = 'Committed with a stop at every step';

/** The invariants of any instant: all or nothing in the ledger, never lost before the commit exists. */
async function expectStoppedInvariants(project: QueueProject, before: number): Promise<void> {
  const paths = await ledgerPaths(project);
  expect([[], [specPath(1), specPath(2)]]).toContainEqual(paths);
  const commits = manualCommits(project);
  expect(commits.length).toBeLessThanOrEqual(1);
  expect(headCount(project)).toBe(before + commits.length);
  // The ledger is pruned only after the commit exists and holds the paths.
  if (paths.length === 0) expect(commits).toHaveLength(1);
  if (commits.length === 1) {
    expect(git(project.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', commits[0]!)).toBe(
      [specPath(1), specPath(2)].join('\n'),
    );
  }
}

/** Runs the manual commit once; `failAt` > 0 kills it before that durable step. Returns the steps counted. */
async function runOnce(mode: 'record' | 'rename', failAt: number): Promise<number> {
  const project = await manualModeProject();
  await saveUncommitted(project, 1, 'one\n');
  await saveUncommitted(project, 2, 'two\n');
  const before = headCount(project);
  const operationId = randomUUID();

  control.mode = mode;
  control.count = 0;
  control.failAt = failAt;
  control.dead = false;
  control.armed = true;
  let stopped = false;
  try {
    await commitUncommitted(project, { operationId, message: MESSAGE });
  } catch (error) {
    if (!control.dead) throw error;
    stopped = true;
  }
  control.armed = false;
  control.dead = false;
  const steps = control.count;
  if (failAt > 0) expect(stopped, `no stop before step ${failAt}`).toBe(true);

  await expectStoppedInvariants(project, before);

  // The client repeats the request it never saw answered, with its operation id.
  const result = await commitUncommitted(project, { operationId, message: MESSAGE });

  expect(result.commit.state).toBe('committed');
  expect(result.paths).toEqual([specPath(1), specPath(2)]);
  expect(headCount(project)).toBe(before + 1);
  expect(manualCommits(project)).toHaveLength(1);
  expect(await ledgerPaths(project)).toEqual([]);
  expect(workingTreeClean(project)).toBe(true);
  expect(await readQueueLease(project.engine.context, project.workspaceId)).toBeUndefined();
  expect(await checkoutClaimFree(project)).toBe(true);
  expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
  await removeTrackedRoots();
  return steps;
}

describe.skipIf(!onLinux)('a stop before every durable step of a manual commit', () => {
  for (const [mode, label, least] of [
    ['record', 'record write (journal, lease, ledger)', 4],
    ['rename', 'rename (record, payload, document file, settled move)', 6],
  ] as const) {
    it(`leaves the invariants true at a stop before every ${label} and the same end state after the repeat`, async () => {
      const total = await runOnce(mode, 0);
      expect(total).toBeGreaterThan(least);
      for (let failAt = 1; failAt <= total; failAt += 1) {
        try {
          await runOnce(mode, failAt);
        } catch (error) {
          throw new Error(`${mode}: stopped before step ${failAt} of ${total}`, { cause: error });
        }
      }
    }, 900_000);
  }
});
