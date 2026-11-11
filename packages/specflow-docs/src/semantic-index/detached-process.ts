// Starting the background `semantic index` (`createProcessCatchUp`) as a detached process of the
// host's own executable, and which Node options it keeps from the parent.

import { spawn } from 'node:child_process';
import { closeSync, openSync, renameSync, statSync, writeSync } from 'node:fs';

/** The command line of `semantic index` as the host's own executable runs it. */
export interface BackgroundIndexLaunch {
  /** Executable, normally `process.execPath` (the same Node binary). */
  readonly command: string;
  /** For example `[<entry script>, 'docs', 'semantic', 'index']`. */
  readonly args: readonly string[];
}

export interface DetachedProcessRequest extends BackgroundIndexLaunch {
  /** Working directory: the project root. */
  readonly cwd: string;
  /** Receives the process's stdout and stderr, appended (see `CATCH_UP_LOG_MAX_BYTES`). */
  readonly logFile: string;
}

/**
 * Starts a process that outlives the caller. Resolves once the process has started (its `spawn`
 * event) and rejects when it cannot be started, synchronously or through the child's asynchronous
 * `error` event (for example `ENOENT` for a missing executable). It never waits for the process to
 * end.
 */
export type SpawnDetached = (request: DetachedProcessRequest) => Promise<void>;

/**
 * A log above this size is moved to `<log>.1` (replacing the previous one) before the next start,
 * so the two files stay bounded; a log still open by a running process is appended to instead.
 */
export const CATCH_UP_LOG_MAX_BYTES = 256 * 1024;

/**
 * Detached and without a console window (Windows) or terminal session, stdio to the log file and
 * unreferenced, so the search exits at once and the process keeps running after it. A start that
 * fails appends one diagnostic line to the log before it rejects.
 */
export const spawnDetachedProcess: SpawnDetached = async ({ command, args, cwd, logFile }) => {
  rotateLog(logFile);
  const log = openSync(logFile, 'a');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
      });
      // Startup only: the first of `spawn` and `error` settles it, later events change nothing.
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
      child.on('error', reject);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeSync(log, `${new Date().toISOString()} could not start ${command}: ${message}\n`);

    throw error;
  } finally {
    closeSync(log);
  }
};

function rotateLog(logFile: string): void {
  try {
    if (statSync(logFile).size > CATCH_UP_LOG_MAX_BYTES) {
      renameSync(logFile, `${logFile}.1`);
    }
  } catch {
    // No log yet, or it cannot be moved (still open on Windows): append to it.
  }
}

/**
 * The Node options a detached child keeps from the parent's `process.execArgv`: loader and other
 * runtime flags yes, debugger and profiler flags no (a second `--inspect` would fight for the port,
 * a profiler would write its files from a process nobody watches).
 */
export function backgroundExecArgv(execArgv: readonly string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < execArgv.length; index += 1) {
    const flag = execArgv[index]!;
    if (!DROPPED_FLAG.test(flag)) {
      kept.push(flag);
    } else if (VALUE_FLAG.test(flag)) {
      // `--cpu-prof-dir dir`: the value is the next entry and goes with its flag.
      index += 1;
    }
  }

  return kept;
}

const DROPPED_FLAG =
  /^--(?:inspect(?:-brk|-port|-wait)?|debug-port|cpu-prof|heap-prof|prof)(?:[-=]|$)/;

/** Dropped flags whose value, when not given with `=`, is the next entry. */
const VALUE_FLAG =
  /^--(?:inspect-port|debug-port|cpu-prof-(?:dir|name|interval)|heap-prof-(?:dir|name|interval))$/;
