/**
 * INTERNAL Engine port for Engine-owned scoped commits. Never exported from the package entrypoint.
 * Callers never stage or commit themselves: every Engine commit goes through this port, so the
 * protected-branch guard cannot be forgotten at a call site.
 */
import type {
  DocumentPathExpectation,
  DocumentPathFacts,
  DocumentPathInspection,
} from './document-change';

export type EngineCommitKind =
  | 'specification-create'
  | 'definitions-install'
  | 'document-change'
  /** A person-requested commit of the paths the uncommitted-changes ledger holds (ADR 0018). */
  | 'manual-commit';

/** Default request-level budget of a document-change commit attempt. */
export const DOCUMENT_COMMIT_DEADLINE_MS = 150_000;

export interface EngineCommitRequest {
  /** Verified physical checkout root. */
  readonly root: string;
  /** Short branch name pinned by the caller; HEAD must be attached to exactly this branch. */
  readonly expectedBranch: string;
  /** Repo-relative literal file paths (no globs); only these ever enter the commit. */
  readonly paths: readonly string[];
  /** UUID of the Engine operation; recorded as the `Nevo-Operation` trailer for idempotent replay. */
  readonly operationId: string;
  readonly kind: EngineCommitKind;
  /** Single line; control characters are stripped. */
  readonly subject: string;
  /**
   * Optional description. A single line (e.g. the Specification title) for every kind but
   * `manual-commit`, whose body is the person's text: several lines, at most 2000 characters, cleaned
   * and with every line that looks like an Engine trailer quoted (see `commit-message.ts`).
   */
  readonly body?: string;
  /** Additional `Nevo-*` trailers (`Nevo-Operation` and `Nevo-Kind` are added by the port). */
  readonly trailers?: Readonly<Record<string, string>>;
  /**
   * `document-change` and `manual-commit` only: batch paths that were dropped from the effective set (their working
   * state equals HEAD). They are not committed; the port only clears stale intent-to-add entries of
   * those that are absent on disk and untracked.
   */
  readonly droppedPaths?: readonly string[];
  /**
   * `document-change` and `manual-commit` only: budget of the whole attempt (the Git steps of this call, the
   * intent-to-add step, the commit and its verification). Default `DOCUMENT_COMMIT_DEADLINE_MS`.
   */
  readonly deadlineMs?: number;
}

export interface EngineCommitResult {
  readonly sha: string;
  /** HEAD immediately before this operation's commit (the commit's first parent). */
  readonly parentHead: string;
}

export type FoundCommit =
  | { readonly status: 'found'; readonly sha: string; readonly paths: readonly string[] }
  | { readonly status: 'absent' }
  /** `sinceHead` is no longer an ancestor of HEAD: history was rewritten. */
  | { readonly status: 'history-changed' };

export type PathsState =
  | { readonly state: 'uncommitted' }
  | { readonly state: 'committed'; readonly sha: string }
  | { readonly state: 'mixed' };

export interface CommitPort {
  /**
   * Read-only admission check: policy protection, HEAD attached to `expectedBranch`, no merge/rebase/
   * cherry-pick in progress, no unmerged paths, a resolvable HEAD, the paths not ignored and no held
   * index lock. Throws `BRANCH_PROTECTED` or `COMMIT_BLOCKED`.
   */
  preflight(request: EngineCommitRequest): Promise<void>;
  /**
   * Runs `preflight` again, then commits exactly `paths` (`git commit --only`) with the user's Git
   * identity as author (Engine identity when unconfigured), the Engine as committer, hooks and signing
   * off. A non-zero Git exit that provably left no commit is `COMMIT_FAILED`; a timeout or an
   * unreadable result is `GIT_OPERATION_UNCERTAIN` (reconcile with `findByOperation`, never blind retry).
   * For `document-change` and `manual-commit`: `paths` is the effective set (see `effectivePaths`; a path that has become
   * equal to HEAD is refused as `COMMIT_BLOCKED` / `effective-set-changed`), stale intent-to-add entries
   * are removed first, the whole attempt is bounded by `deadlineMs`, and a Git step that had to be
   * killed (the process tree is gone) with decisive evidence that nothing happened (no commit with the
   * trailer, HEAD still the parent, no index lock) is the retryable `COMMIT_BLOCKED` / `commit-timed-out`
   * (or `deadline-exceeded`) after the Engine's own index entries were taken back; without that
   * evidence it stays `GIT_OPERATION_UNCERTAIN`.
   */
  commit(request: EngineCommitRequest): Promise<EngineCommitResult>;
  /**
   * The commit created by `operationId` on top of `sinceHead`, found by its `Nevo-Operation` trailer or by
   * an id listed whole in `Nevo-Coalesced`. An id that was cut off that trailer (the `,+N` form) is NOT
   * findable here: a caller that gets `absent` for an operation that was coalesced must fall back to
   * `inspectDocumentPaths` against the operation's recorded `{ pre, post }`.
   */
  findByOperation(root: string, operationId: string, sinceHead: string): Promise<FoundCommit>;
  /** Current HEAD of the checkout, or undefined for an unborn branch. */
  head(root: string): Promise<string | undefined>;
  /** Short name of the attached branch; `COMMIT_BLOCKED` (`detached`) when HEAD is detached. */
  currentBranch(root: string): Promise<string>;
  /**
   * Where `paths` stand: `uncommitted` (none is in HEAD; untracked or intent-to-add), `committed`
   * (all in HEAD and identical to the working tree; `sha` is the last commit touching them) or
   * `mixed` (anything else).
   */
  inspectPaths(root: string, paths: readonly string[]): Promise<PathsState>;
  /**
   * True when the blob of `path` in `commitSha` is exactly what Git stores for the file's current
   * working-tree bytes: the same `.gitattributes` (text, eol, filters) apply as in a hand `git add`,
   * but `core.autocrlf` does not. This is the attribute-aware "the commit holds the pinned bytes".
   */
  blobMatchesWorkingFile(root: string, commitSha: string, path: string): Promise<boolean>;
  /**
   * The effective path set of a document batch: the paths whose working-tree state differs from HEAD
   * (attribute-aware blob id of the file against the HEAD blob; a deleted file equals an absent blob).
   * Read-only; nothing is mutated. `effective` is what the commit request, the exact-set check and the
   * `Nevo-Documents` trailer use; when it is empty there is nothing to commit and no Git mutation runs.
   */
  effectivePaths(root: string, paths: readonly string[]): Promise<EffectivePaths>;
  /**
   * What each path holds in the working tree and in `at` (default HEAD; a commit id to verify a
   * commit). Deletions are read from `ls-tree <at>` not listing the path, never from `hash-object`. A directory or submodule where a document is expected (in `at` or on disk) is a `non-blob:` state, never an absent path.
   */
  pathFacts(root: string, paths: readonly string[], at?: string): Promise<DocumentPathFacts[]>;
  /**
   * Classifies each path against its recorded `{ pre, post }` (see `classifyDocumentPath`), in the
   * order of `expectations`; `at` as in `pathFacts`.
   */
  inspectDocumentPaths(
    root: string,
    expectations: readonly DocumentPathExpectation[],
    at?: string,
  ): Promise<DocumentPathInspection[]>;
  /** True when `ancestor` is `descendant` or one of its ancestors. */
  isAncestor(root: string, ancestor: string, descendant: string): Promise<boolean>;
}

export interface EffectivePaths {
  /** Paths the commit would change, in the order given. */
  readonly effective: string[];
  /** Paths whose working state equals HEAD (nothing to commit for them). */
  readonly dropped: string[];
  readonly facts: DocumentPathFacts[];
}
