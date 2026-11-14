// Write admission (ADR 0022 §3): the index is local cache and MUST NOT be committed, and the ignore
// rules change with the branch, so an uncached check runs immediately before every write batch of
// the index directory (a vector store lock or slice, the chunk cache, a progress record, a catch-up
// start, a seed copy), in a refresh already running too. A refused write writes nothing and the
// search answers lexically with the refusal until a later check admits again.
//
// The check fails closed: inside a Git work tree only Git's explicit "ignored" answer admits. A
// project that is not in a Git work tree at all (the CLI also serves plain directories) is admitted,
// but only when that is established explicitly (no `.git` in the project root or above it, given
// or resolved, and no `GIT_DIR`), never inferred from a Git failure.

import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { ApplyOutcome, OpenWriterOutcome, VectorStore } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import { cacheIgnoreUnverifiedReason, cacheNotIgnoredReason } from './reasons';

/**
 * What Git answers about a path below the project root: `ignored` and `not-ignored` are Git's own
 * answers; `outside-work-tree` is a project established to be in no Git work tree; `unverified`
 * is any other outcome (Git failed, timed out or could not be run inside a work tree), with a
 * description that names no absolute path.
 */
export type GitIgnoreAnswer =
  | { readonly status: 'ignored' }
  | { readonly status: 'not-ignored' }
  | { readonly status: 'outside-work-tree' }
  | { readonly status: 'unverified'; readonly detail: string };

/** Whether Git ignores `path` (relative to `projectRoot`), asked afresh. Never rejects. */
export type GitIgnoreCheck = (projectRoot: string, path: string) => Promise<GitIgnoreAnswer>;

/** How one Git command ended. */
export type GitRunOutcome =
  | { readonly status: 'exited'; readonly code: number }
  | { readonly status: 'timed-out' }
  | { readonly status: 'not-run' };

/** Runs Git with `args`. Never rejects. */
export type RunGit = (args: readonly string[]) => Promise<GitRunOutcome>;

/**
 * Whether `projectRoot` may be in a Git work tree: `present` with a `.git` entry in it or above it,
 * as given or resolved through symbolic links (or `GIT_DIR` set), `absent` when neither path has one
 * up to the filesystem root, `unknown` when that cannot be told (the root cannot be resolved, or a
 * directory cannot be read). Never rejects.
 */
export type FindGitRepository = (projectRoot: string) => Promise<'present' | 'absent' | 'unknown'>;

const GIT_TIMEOUT_MS = 10_000;

const runGit: RunGit = (args) =>
  new Promise((resolve) => {
    execFile('git', args, { windowsHide: true, timeout: GIT_TIMEOUT_MS }, (error) => {
      if (error === null) {
        resolve({ status: 'exited', code: 0 });
      } else if (error.killed) {
        resolve({ status: 'timed-out' });
      } else if (typeof error.code === 'number') {
        resolve({ status: 'exited', code: error.code });
      } else {
        // A spawn failure, for example Git not installed (`ENOENT`).
        resolve({ status: 'not-run' });
      }
    });
  });

export const findGitRepository: FindGitRepository = async (projectRoot) => {
  if (process.env.GIT_DIR !== undefined && process.env.GIT_DIR !== '') {
    return 'present';
  }

  // Both the given root and its resolved one: Git follows a symbolic link or junction, so a root
  // that links into a repository is in that repository although its own path has no `.git` above.
  let resolved: string;
  try {
    resolved = await realpath(projectRoot);
  } catch {
    return 'unknown';
  }

  const given = await gitEntryAbove(resolve(projectRoot));
  if (given !== 'absent') {
    return given;
  }

  return gitEntryAbove(resolved);
};

/** Whether `directory` or a directory above it has a `.git` entry. */
async function gitEntryAbove(directory: string): Promise<'present' | 'absent' | 'unknown'> {
  for (let current = directory; ;) {
    try {
      await lstat(join(current, '.git'));

      return 'present';
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        return 'unknown';
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return 'absent';
    }

    current = parent;
  }
}

/** `git check-ignore` (see `GitIgnoreAnswer`); `run` and `findRepository` are test seams. */
export function createGitIgnoreCheck(
  run: RunGit = runGit,
  findRepository: FindGitRepository = findGitRepository,
): GitIgnoreCheck {
  return async (projectRoot, path) => {
    const ran = await run(['-C', projectRoot, 'check-ignore', '-q', '--', path]);
    if (ran.status === 'exited' && ran.code === 0) {
      return { status: 'ignored' };
    }

    if (ran.status === 'exited' && ran.code === 1) {
      return { status: 'not-ignored' };
    }

    // No answer from Git (outside a work tree it exits 128 as well): admitted only when no
    // repository can be there.
    if ((await findRepository(projectRoot)) === 'absent') {
      return { status: 'outside-work-tree' };
    }

    switch (ran.status) {
      case 'exited':
        return {
          status: 'unverified',
          detail: `git check-ignore exited with code ${String(ran.code)}`,
        };
      case 'timed-out':
        return { status: 'unverified', detail: 'git check-ignore did not answer in time' };
      case 'not-run':
        return { status: 'unverified', detail: 'Git could not be run' };
    }
  };
}

/** `git check-ignore`, run afresh on every call: an answer is never reused. */
export const gitIgnores: GitIgnoreCheck = createGitIgnoreCheck();

/** May the index directory be written now? Asked immediately before a write; never rejects. */
export type AdmitWrite = () => Promise<boolean>;

/** The reason a write is refused now, or `undefined` when it is admitted. Never rejects. */
export type WriteAdmission = () => Promise<DocsSearchReason | undefined>;

/**
 * Admits a write of `directory` (relative to `projectRoot`, without a trailing slash) when Git
 * ignores it or the project is in no Git work tree; refuses it otherwise (fail closed).
 */
export function gitIgnoreAdmission(
  projectRoot: string,
  directory: string,
  isIgnored: GitIgnoreCheck = gitIgnores,
): WriteAdmission {
  return async () => {
    const answer = await isIgnored(projectRoot, `${directory}/`);
    switch (answer.status) {
      case 'ignored':
      case 'outside-work-tree':
        return undefined;
      case 'not-ignored':
        return cacheNotIgnoredReason(directory);
      case 'unverified':
        return cacheIgnoreUnverifiedReason(directory, answer.detail);
    }
  };
}

/** The admission of one index, with the outcome of its latest check. */
export interface IndexWrites {
  /**
   * Runs the check before a write batch (one call per batch): `undefined` admits the write,
   * otherwise nothing is written and the answer is why.
   */
  check(): Promise<DocsSearchReason | undefined>;
  /** Why the index is not written: set by a refused check, cleared by an admitted one. */
  refusal(): DocsSearchReason | undefined;
  /**
   * Before an operation that may write: `undefined` unless the latest check refused, in which case
   * the check runs again (so a fixed `.gitignore` is seen) and its refusal, if any, is returned.
   * Every write of the operation still runs `check`.
   */
  blocked(): Promise<DocsSearchReason | undefined>;
}

/** `admission` with its latest outcome; `initial` is that of a check made when the index was opened. */
export function createIndexWrites(
  admission: WriteAdmission,
  initial?: DocsSearchReason,
): IndexWrites {
  let refusal = initial;
  const check = async () => {
    const outcome = await admission();
    refusal = outcome;

    return outcome;
  };

  return {
    check,
    refusal: () => refusal,
    blocked: async () => (refusal === undefined ? undefined : check()),
  };
}

/**
 * `store` whose writer is taken and whose every change is applied only after `writes` admits it. A
 * refused write answers `write-failed` with the refusal's message; the lock of an admitted writer is
 * still released by `close`.
 */
export function admittedVectorStore(store: VectorStore, writes: IndexWrites): VectorStore {
  const refused = (
    reason: DocsSearchReason,
  ): Extract<ApplyOutcome, { status: 'write-failed' }> => ({
    status: 'write-failed',
    message: reason.message,
  });

  return {
    readManifest: () => store.readManifest(),
    readEntries: () => store.readEntries(),
    query: (query) => store.query(query),
    async openWriter(): Promise<OpenWriterOutcome> {
      const refusal = await writes.check();
      if (refusal !== undefined) {
        return refused(refusal);
      }

      const opened = await store.openWriter();
      if (opened.status !== 'opened') {
        return opened;
      }

      const { writer } = opened;

      return {
        status: 'opened',
        writer: {
          async apply(change): Promise<ApplyOutcome> {
            const refusal = await writes.check();

            return refusal === undefined ? writer.apply(change) : refused(refusal);
          },
          close: () => writer.close(),
        },
      };
    },
  };
}
