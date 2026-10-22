/**
 * INTERNAL Engine port for Engine-owned scoped commits. Never exported from the package entrypoint.
 * Callers never stage or commit themselves: every Engine commit goes through this port, so the
 * protected-branch guard cannot be forgotten at a call site.
 */
export type EngineCommitKind = 'specification-create';

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
  /** Optional single-line description (e.g. the Specification title). */
  readonly body?: string;
  /** Additional `Nevo-*` trailers (`Nevo-Operation` and `Nevo-Kind` are added by the port). */
  readonly trailers?: Readonly<Record<string, string>>;
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
   */
  commit(request: EngineCommitRequest): Promise<EngineCommitResult>;
  /** The commit created by `operationId` on top of `sinceHead`, found by its trailer. */
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
  /** Exact content of `path` in `commitSha`, or undefined when absent there. */
  fileAt(root: string, commitSha: string, path: string): Promise<string | undefined>;
  /** True when `ancestor` is `descendant` or one of its ancestors. */
  isAncestor(root: string, ancestor: string, descendant: string): Promise<boolean>;
}
