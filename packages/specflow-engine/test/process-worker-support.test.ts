import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  awaitProcessMarker,
  observeChildProcess,
  readProcessCheckpoint,
  reapVitestWorker,
} from './support/process-worker';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function realWorker(script: string) {
  return observeChildProcess(
    spawn(process.execPath, ['-e', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }),
  );
}

describe('Q06 real-process harness negative outcomes', () => {
  it('ends marker wait on an actual early nonzero child exit with captured diagnostics', async () => {
    const worker = realWorker("process.stderr.write('child-failed\\n'); process.exit(7)");
    const missing = join(tmpdir(), 'q06-absent-' + randomUUID());
    const started = Date.now();
    await expect(awaitProcessMarker(missing, worker, 15000, 20)).rejects.toThrow(
      /Worker exited before checkpoint.*child-failed/su,
    );
    expect(Date.now() - started).toBeLessThan(5000);
    const outcome = await reapVitestWorker(worker);
    expect(outcome.code).toBe(7);
  });

  it('times out promptly without a marker and without an unobserved worker', async () => {
    const missing = join(tmpdir(), 'q06-missing-' + randomUUID());
    await expect(awaitProcessMarker(missing, undefined, 80, 10)).rejects.toThrow(
      /Process checkpoint missing/u,
    );
  });

  it('rejects partial JSON, forged PID, wrong phase and wrong operation identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q06-checkpoint-'));
    roots.push(root);
    const marker = join(root, 'checkpoint.json');
    await writeFile(marker, '{broken');
    await expect(readProcessCheckpoint(marker)).rejects.toThrow(/Invalid process checkpoint/u);
    await writeFile(marker, JSON.stringify({ pid: process.pid, stage: 'ready' }));
    await expect(readProcessCheckpoint(marker)).rejects.toThrow(/Invalid or unexpected/u);
    await writeFile(
      marker,
      JSON.stringify({ pid: process.pid + 1, stage: 'ready', operationId: 'a' }),
    );
    await expect(readProcessCheckpoint(marker, 'different', 'a')).rejects.toThrow();
    await expect(readProcessCheckpoint(marker, 'ready', 'b')).rejects.toThrow();
    await expect(readProcessCheckpoint(marker, 'ready', 'a')).resolves.toMatchObject({
      stage: 'ready',
      operationId: 'a',
    });
  });

  it('kills and reaps a real hanging OS process, leaving no running PID', async () => {
    const worker = realWorker('setInterval(() => undefined, 1000)');
    if (!worker.pid) throw new Error('Expected an independent child PID.');
    const pid = worker.pid;
    const result = await reapVitestWorker(worker, 10000);
    expect(result.code).not.toBe(0);
    await expect(worker.done).resolves.toEqual(result);
    // The OS process must really be gone, not just a simulated exception.
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
