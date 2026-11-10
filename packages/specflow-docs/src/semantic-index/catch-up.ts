// The background catch-up (ADR 0020 §5): a search that finds more chunks without vectors than it
// embeds answers lexically at once and has a full refresh run in the background instead of asking
// for `semantic index` by hand. A host supplies the catch-up: the CLI starts a detached
// `semantic index` process (`createProcessCatchUp`), a running Runtime its in-process refresh.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, openSync, renameSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readIndexActivity } from './progress';

/**
 * How a search has the index caught up. Both methods describe the catch-up as a clause of the
 * `index-building` reason ("…more than a search embeds (16); <clause>.") and never throw.
 */
export interface IndexCatchUp {
  /** A full refresh already runs, or was started moments ago; `undefined` when none does. */
  running(): Promise<string | undefined>;
  /** Starts a full refresh in the background without waiting for it. */
  start(): Promise<string>;
}

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

/** Starts a process that outlives the caller; throws only when it cannot be started at all. */
export type SpawnDetached = (request: DetachedProcessRequest) => void;

/** The log of the latest background `semantic index`, in the index directory. */
export const CATCH_UP_LOG_FILE = 'catch-up.log';

/**
 * A log above this size is moved to `<log>.1` (replacing the previous one) before the next start,
 * so the two files stay bounded; a log still open by a running process is appended to instead.
 */
export const CATCH_UP_LOG_MAX_BYTES = 256 * 1024;

/** Written when a background `semantic index` is started; see `CATCH_UP_START_COOLDOWN_MS`. */
export const CATCH_UP_MARKER_FILE = 'catch-up.started';

/**
 * How long a started catch-up counts as running before its process holds the writer lock. Searches
 * in that window, concurrent ones included, start no other process; after it, a catch-up whose
 * process ended without bringing the index up to date (for example an endpoint failure, in the log)
 * is started again by the next search, at most once per window.
 */
export const CATCH_UP_START_COOLDOWN_MS = 60_000;

/**
 * Detached and without a console window (Windows) or terminal session, stdio to the log file and
 * unreferenced, so the search exits at once and the process keeps running after it.
 */
export const spawnDetachedProcess: SpawnDetached = ({ command, args, cwd, logFile }) => {
  rotateLog(logFile);
  const log = openSync(logFile, 'a');
  try {
    const child = spawn(command, [...args], {
      cwd,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
    });
    // A start failure after spawn returned only means the index stays behind; the log says why.
    child.once('error', () => undefined);
    child.unref();
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
  const dropped =
    /^--(?:inspect(?:-brk|-port|-wait)?|debug-port|cpu-prof|heap-prof|prof)(?:[-=]|$)/;

  return execArgv.filter((flag) => !dropped.test(flag));
}

export interface ProcessCatchUpOptions {
  /** Absolute index directory (`DocsIndex.directory`). */
  readonly directory: string;
  /** Absolute project root, the working directory of the process. */
  readonly projectRoot: string;
  readonly launch: BackgroundIndexLaunch;
  readonly spawn: SpawnDetached;
  readonly now: () => number;
  /** `semantic index` and `semantic status` as the host invokes them, quoted in the clauses. */
  readonly indexCommand: string;
  readonly statusCommand: string;
}

/**
 * The CLI catch-up: a detached `semantic index` of the same executable. It does not start one while
 * any writer holds the index (the single-writer lock would turn it away) or within
 * `CATCH_UP_START_COOLDOWN_MS` of the last start, claimed with an exclusively created marker file so
 * that concurrent searches start one process between them.
 */
export function createProcessCatchUp(options: ProcessCatchUpOptions): IndexCatchUp {
  const { directory, now, indexCommand, statusCommand } = options;
  const marker = join(directory, CATCH_UP_MARKER_FILE);
  const follow = `follow it with \`${statusCommand}\``;
  const started = `a background \`${indexCommand}\` is updating it; ${follow}`;

  return {
    async running() {
      const activity = await readIndexActivity(directory);
      if (activity.state === 'updating') {
        const { progress, pid } = activity;
        const who = pid === undefined ? 'another process' : `process ${String(pid)}`;

        return progress === undefined
          ? `${who} is updating it; ${follow}`
          : `${who} is updating it in the background (${String(progress.embedded)}/${String(progress.total)} chunks since ${progress.startedAt}); ${follow}`;
      }

      const age = await markerAge(marker, now());

      return age !== undefined && age < CATCH_UP_START_COOLDOWN_MS ? started : undefined;
    },

    async start() {
      let claimed = false;
      try {
        await mkdir(directory, { recursive: true });
        claimed = await claimStart(marker, now(), CATCH_UP_START_COOLDOWN_MS);
        if (claimed) {
          options.spawn({
            ...options.launch,
            cwd: options.projectRoot,
            logFile: join(directory, CATCH_UP_LOG_FILE),
          });
        }

        return started;
      } catch (error) {
        // Nothing runs, so the next search may try again at once.
        if (claimed) {
          await unlink(marker).catch(() => undefined);
        }

        return `starting a background \`${indexCommand}\` failed (${error instanceof Error ? error.message : String(error)}); run it yourself`;
      }
    },
  };
}

/**
 * Takes the start for this search. The marker is created exclusively, holding a token. One older
 * than the cooldown is first moved aside under a private name (a rename succeeds for one search
 * only) and the moved file is checked to be the stale marker that was inspected: a search that
 * moved a marker another search has just created puts it back and does not start. Then one more
 * exclusive create decides between the searches that moved a stale marker aside.
 */
async function claimStart(marker: string, now: number, cooldownMs: number): Promise<boolean> {
  const token = randomBytes(8).toString('hex');
  if (await createExclusive(marker, token)) {
    return true;
  }

  const seen = await readMarker(marker, now);
  if (seen === undefined || seen.age < cooldownMs) {
    return false;
  }

  const aside = `${marker}.${token}.stale`;
  try {
    await rename(marker, aside);
  } catch {
    return false;
  }

  const moved = await readMarker(aside, now);
  if (moved?.token !== seen.token || moved.age < cooldownMs) {
    await rename(aside, marker).catch(() => unlink(aside).catch(() => undefined));

    return false;
  }

  await unlink(aside).catch(() => undefined);

  return createExclusive(marker, token);
}

async function readMarker(
  path: string,
  now: number,
): Promise<{ readonly token: string; readonly age: number } | undefined> {
  try {
    const [token, age] = await Promise.all([readFile(path, 'utf8'), markerAge(path, now)]);

    return age === undefined ? undefined : { token, age };
  } catch {
    return undefined;
  }
}

/**
 * Milliseconds since the marker was written: its modification time (the filesystem's clock) against
 * `now` (the injected clock, `Date.now` in production, so both read the same system time; tests
 * move `now` ahead to pass the cooldown). `undefined` without a marker.
 */
async function markerAge(marker: string, now: number): Promise<number | undefined> {
  try {
    return Math.max(0, now - (await stat(marker)).mtimeMs);
  } catch {
    return undefined;
  }
}

async function createExclusive(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: 'wx' });

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }

    throw error;
  }
}
