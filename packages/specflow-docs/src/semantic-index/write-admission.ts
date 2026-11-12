// Write admission (ADR 0022 §3): the index is local cache and MUST NOT be committed, and the ignore
// rules change with the branch, so an uncached check runs immediately before every write batch of
// the index directory (a vector store lock or slice, the chunk cache, a catch-up start, a seed
// copy), in a refresh already running too. A refused write writes nothing and the search answers
// lexically with the refusal until a later check admits again.

import { execFile } from 'node:child_process';

import type { ApplyOutcome, OpenWriterOutcome, VectorStore } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

/**
 * Whether Git ignores `path` (relative to `projectRoot`): `undefined` when `projectRoot` is not in a
 * Git work tree or Git cannot be run, where nothing can commit the cache by accident.
 */
export type GitIgnoreCheck = (projectRoot: string, path: string) => Promise<boolean | undefined>;

/** `git check-ignore`, run afresh on every call: an answer is never reused. Never rejects. */
export const gitIgnores: GitIgnoreCheck = (projectRoot, path) =>
  new Promise((resolve) => {
    execFile(
      'git',
      ['-C', projectRoot, 'check-ignore', '-q', '--', path],
      { windowsHide: true, timeout: 10_000 },
      (error) => {
        if (error === null) {
          resolve(true);
        } else {
          // Exit 1: not ignored; 128, a missing Git or a timeout: no answer.
          resolve(error.code === 1 ? false : undefined);
        }
      },
    );
  });

/** May the index directory be written now? Asked immediately before a write; never rejects. */
export type AdmitWrite = () => Promise<boolean>;

/** Admits a write unless Git answers that it does not ignore `path` below `projectRoot`. */
export function gitIgnoreAdmission(
  projectRoot: string,
  path: string,
  isIgnored: GitIgnoreCheck = gitIgnores,
): AdmitWrite {
  return async () => (await isIgnored(projectRoot, path)) !== false;
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

/**
 * `admitWrite` with `refused` as the reason of a refusal. `initial` is the outcome of a check made
 * when the index was opened, if any.
 */
export function createIndexWrites(
  admitWrite: AdmitWrite,
  refused: DocsSearchReason,
  initial?: DocsSearchReason,
): IndexWrites {
  let refusal = initial;
  const check = async () => {
    const outcome = (await admitWrite()) ? undefined : refused;
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
