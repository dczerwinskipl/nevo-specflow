import { spawn, type ChildProcess } from 'node:child_process';
import { access, lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export interface ProcessOutcome {
  readonly code: number | null;
  readonly log: string;
}

/** A real, independently identified and reapable OS process. */
export interface IndependentVitestWorker {
  readonly pid: number | undefined;
  readonly done: Promise<ProcessOutcome>;
  readonly log: () => string;
  readonly kill: (signal?: NodeJS.Signals) => boolean;
}

export function observeChildProcess(child: ChildProcess): IndependentVitestWorker {
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk: string) => {
      output += chunk;
    });
  }
  const done = new Promise<ProcessOutcome>((resolveDone, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolveDone({ code, log: output }));
  });
  return {
    pid: child.pid,
    done,
    log: () => output,
    kill: (signal = 'SIGKILL') => child.kill(signal),
  };
}

/**
 * Runs one fixture (or several, which Vitest may run side by side) in a child Vitest.
 * `runnerArgs` replaces the default of one serial worker, for example to run two fixtures as threads
 * of one process.
 */
export function spawnVitestWorker(
  fixture: string | readonly string[],
  env: NodeJS.ProcessEnv,
  testTimeoutMs: number,
  runnerArgs: readonly string[] = ['--maxWorkers=1'],
): IndependentVitestWorker {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  return observeChildProcess(
    spawn(
      process.execPath,
      [
        vitestEntry,
        'run',
        ...(typeof fixture === 'string' ? [fixture] : fixture),
        ...runnerArgs,
        '--testTimeout=' + testTimeoutMs,
      ],
      {
        cwd: packageRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      },
    ),
  );
}

/** Never treat an absent marker as a reason to wait after the worker has exited. */
export async function awaitProcessMarker(
  marker: string,
  worker?: IndependentVitestWorker,
  timeoutMs = 90000,
  retryMs = 40,
): Promise<void> {
  const abort = new AbortController();
  const poll = async () => {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      try {
        await access(marker);
        return;
      } catch (error) {
        if (Date.now() >= deadline)
          throw new Error('Process checkpoint missing: ' + marker + '\\n' + (worker?.log() ?? ''), {
            cause: error,
          });
        await sleep(retryMs, undefined, { signal: abort.signal });
      }
    }
  };
  try {
    if (!worker) return await poll();
    return await Promise.race([
      poll(),
      worker.done.then(async (outcome) => {
        // A worker that writes its marker and exits at once wins this race: the marker is the answer.
        if (
          await access(marker).then(
            () => true,
            () => false,
          )
        )
          return;
        throw new Error(
          'Worker exited before checkpoint ' +
            marker +
            ' (exit ' +
            outcome.code +
            '):\\n' +
            outcome.log,
        );
      }),
    ]);
  } finally {
    abort.abort();
  }
}

export interface ProcessCheckpoint {
  readonly pid: number;
  readonly stage: string;
  readonly operationId?: string;
}

/** Reject partial, malformed, redirected or self-PID markers before any kill. */
export async function readProcessCheckpoint(
  marker: string,
  expectedStage?: string,
  expectedOperationId?: string,
): Promise<ProcessCheckpoint> {
  const stat = await lstat(marker);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Process checkpoint must be a regular file: ' + marker);
  let content: unknown;
  try {
    content = JSON.parse(await readFile(marker, 'utf8')) as unknown;
  } catch {
    throw new Error('Invalid process checkpoint JSON: ' + marker);
  }
  if (typeof content !== 'object' || !content || Array.isArray(content))
    throw new Error('Invalid process checkpoint: ' + marker);
  const record = content as Record<string, unknown>;
  if (
    typeof record.pid !== 'number' ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    record.pid === process.pid ||
    typeof record.stage !== 'string' ||
    record.stage.length === 0 ||
    (expectedStage !== undefined && record.stage !== expectedStage) ||
    (expectedOperationId !== undefined && record.operationId !== expectedOperationId)
  )
    throw new Error('Invalid or unexpected process checkpoint identity: ' + marker);
  return {
    pid: record.pid,
    stage: record.stage,
    ...(typeof record.operationId === 'string' ? { operationId: record.operationId } : {}),
  };
}

/** Kill and REAP the supervisor, including failure paths. Never leave a child unobserved. */
export async function reapVitestWorker(
  worker: IndependentVitestWorker,
  timeoutMs = 15000,
): Promise<ProcessOutcome> {
  worker.kill('SIGKILL');
  const abort = new AbortController();
  try {
    return await Promise.race([
      worker.done,
      sleep(timeoutMs, undefined, { signal: abort.signal }).then(() => {
        worker.kill('SIGKILL');
        throw new Error('Worker did not terminate and cannot be reaped: ' + worker.log());
      }),
    ]);
  } finally {
    abort.abort();
  }
}

/** Kill the ACTUAL checkpoint PID, not merely its supervising Vitest runner. */
export async function terminateCheckpointPid(
  pid: number,
  worker: IndependentVitestWorker,
  timeoutMs = 15000,
): Promise<ProcessOutcome> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
    throw new Error('Invalid or in-process checkpoint PID: ' + pid);
  process.kill(pid, 'SIGKILL');
  const abort = new AbortController();
  try {
    const outcome = await Promise.race([
      worker.done,
      sleep(timeoutMs, undefined, { signal: abort.signal }).then(() => {
        throw new Error('Killed checkpoint process did not terminate: ' + worker.log());
      }),
    ]);
    if (outcome.code === 0)
      throw new Error('Killed checkpoint worker exited with success: ' + outcome.log);
    return outcome;
  } catch (error) {
    await reapVitestWorker(worker);
    throw error;
  } finally {
    abort.abort();
  }
}
