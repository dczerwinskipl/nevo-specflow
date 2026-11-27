import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapProjectHome } from '../src/testing';
import { inspectProjectControlLock, projectControlLockPath } from '../src/project/control-lock';
import { ownExecutorIdentity } from '../src/project/process/executor-identity';
import { createGitTestProject } from './support/git-project';
import {
  reapVitestWorker,
  spawnVitestWorker,
  type IndependentVitestWorker,
} from './support/process-worker';

const roots: string[] = [];
const workers: IndependentVitestWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 10 })),
  );
});

/** A PID that ran and exited. */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

async function until(path: string): Promise<void> {
  for (let tries = 0; tries < 3000; tries += 1) {
    try {
      await access(path);

      return;
    } catch {
      await sleep(10);
    }
  }

  throw new Error('timed out waiting for ' + path);
}

describe('two processes release the same abandoned control lock (ADR 0027)', () => {
  it('lets exactly one of them hold the lock at a time, and both get it', async () => {
    const root = await createGitTestProject('specflow-lock-race-', 'runtime: {}\n');
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    const own = await ownExecutorIdentity();

    for (let round = 0; round < 3; round += 1) {
      // The lock a killed Runtime left: its owner's PID no longer runs.
      const pid = deadPid();
      await writeFile(
        projectControlLockPath(engine.context),
        JSON.stringify({
          version: 1,
          projectId: engine.context.project.projectId,
          token: randomUUID(),
          pid,
          createdAt: new Date().toISOString(),
          owner: { ...own, pid },
        }) + '\n',
      );
      const barrier = join(root, `barrier-${round}`);
      const inside = join(root, `inside-${round}`);
      const results = [0, 1].map((index) => join(root, `result-${round}-${index}`));
      const pair = results.map((result) => {
        const worker = spawnVitestWorker(
          'test/fixtures/lock-release-race-worker.test.ts',
          {
            NEVO_LOCK_RACE_WORKER: '1',
            NEVO_LOCK_RACE_HOME: root,
            NEVO_LOCK_RACE_BARRIER: barrier,
            NEVO_LOCK_RACE_INSIDE: inside,
            NEVO_LOCK_RACE_RESULT: result,
          },
          60000,
        );
        workers.push(worker);

        return worker;
      });
      await Promise.all(results.map((result) => until(result + '.ready')));
      // Both judge the same dead lock at the same moment.
      await writeFile(barrier, 'go');
      const outcomes = await Promise.all(pair.map((worker) => worker.done));
      for (const [index, outcome] of outcomes.entries()) {
        expect(outcome.code, outcome.log).toBe(0);
        expect(await readFile(results[index]!, 'utf8')).toBe('held-alone');
      }

      expect((await inspectProjectControlLock(engine.context)).status).toBe('free');
    }
  }, 240000);
});
