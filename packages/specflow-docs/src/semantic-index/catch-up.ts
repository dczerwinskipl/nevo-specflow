// The background catch-up (ADR 0020 §5): a search that finds more chunks without vectors than it
// embeds answers lexically at once and has a full refresh run in the background instead of asking
// for `semantic index` by hand. A host supplies the catch-up: the CLI starts a detached
// `semantic index` process (`createProcessCatchUp`), a running Runtime its in-process refresh.

import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
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
  /** Receives the process's stdout and stderr, replaced on every start. */
  readonly logFile: string;
}

/** Starts a process that outlives the caller; throws only when it cannot be started at all. */
export type SpawnDetached = (request: DetachedProcessRequest) => void;

/** The log of the latest background `semantic index`, in the index directory. */
export const CATCH_UP_LOG_FILE = 'catch-up.log';

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
  const log = openSync(logFile, 'w');
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
      try {
        await mkdir(directory, { recursive: true });
        if (await claimStart(marker, now(), CATCH_UP_START_COOLDOWN_MS)) {
          options.spawn({
            ...options.launch,
            cwd: options.projectRoot,
            logFile: join(directory, CATCH_UP_LOG_FILE),
          });
        }

        return started;
      } catch (error) {
        return `starting a background \`${indexCommand}\` failed (${error instanceof Error ? error.message : String(error)}); run it yourself`;
      }
    },
  };
}

/**
 * Takes the start for this search: the marker is created exclusively; one older than the cooldown
 * is replaced (one more exclusive create, so of two searches replacing it at once one wins).
 */
async function claimStart(marker: string, now: number, cooldownMs: number): Promise<boolean> {
  const record = new Date(now).toISOString();
  if (await createExclusive(marker, record)) {
    return true;
  }

  const age = await markerAge(marker, now);
  if (age !== undefined && age < cooldownMs) {
    return false;
  }

  await unlink(marker).catch(() => undefined);

  return createExclusive(marker, record);
}

/** Milliseconds since the marker was written (its modification time); `undefined` without one. */
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
