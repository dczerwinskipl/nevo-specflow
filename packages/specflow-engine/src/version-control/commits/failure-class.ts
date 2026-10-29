/**
 * What a failed Engine commit attempt means, classified from the commit port's error alone (ADR 0016
 * decision 13). Shared by every holder of the checkout lease that commits through the port: the
 * document commit queue and the manual commit. No I/O.
 */
import { GitCapabilityError } from '../../git/errors';

/**
 * - `transient`: a blocker that passes by itself (index lock, a busy Git, a timed-out step, an
 *   effective set that changed under the attempt);
 * - `permanent`: the commit cannot happen without a decision (a protected branch, a detached HEAD,
 *   a failed Git commit that provably left nothing);
 * - `uncertain`: the commit may or may not exist; the repository decides, or an operator does.
 */
export type CommitFailureKind = 'transient' | 'permanent' | 'uncertain';

export interface ClassifiedCommitFailure {
  readonly kind: CommitFailureKind;
  /** Open kebab-case; the documented vocabulary of `CommitFailureReason` for permanent and uncertain ones. */
  readonly reason: string;
  /** The commit port's own reason, when it adds to `reason`. */
  readonly blockedBy?: string;
  /**
   * The paths that make a permanent failure, when only some do (a foreign edit, an ignored path, a
   * directory where a document belongs): the queue commits the rest (split-and-retry).
   */
  readonly paths?: readonly string[];
}

/** `COMMIT_BLOCKED` reasons of the port that pass by themselves. */
export const TRANSIENT_BLOCKED_REASONS: readonly string[] = [
  'commit-timed-out',
  'deadline-exceeded',
  'effective-set-changed',
  'index-locked',
  'git-busy',
  'unmerged-paths',
];

/**
 * `COMMIT_BLOCKED` reasons that are failures a human has to resolve: they come from the checkout and
 * not from the content (a detached HEAD, a changed branch, an empty history, an ignored path, an
 * unreadable index).
 */
export const PERMANENT_BLOCKED_REASONS: readonly string[] = [
  'detached',
  'branch-changed',
  'no-commits',
  'path-ignored',
  'index-unreadable',
];

/** The reason of an uncertain outcome whose Git process may still be running. */
export const NOT_TERMINATED = 'not-terminated';

/**
 * Whether a transient failure is one of the port's own blockers, which come before any commit (or
 * come with the port's evidence that nothing happened): such a failure needs no look-up.
 */
export function isBlockedBeforeCommit(reason: string): boolean {
  return TRANSIENT_BLOCKED_REASONS.includes(reason);
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;

function kebab(value: string | undefined): string | undefined {
  return value !== undefined && value.length <= 64 && KEBAB.test(value) ? value : undefined;
}

function withBlockedBy(
  kind: CommitFailureKind,
  reason: string,
  blockedBy: string | undefined,
): ClassifiedCommitFailure {
  const port = kebab(blockedBy);

  return { kind, reason, ...(port !== undefined && port !== reason ? { blockedBy: port } : {}) };
}

/**
 * The classification of an error of the commit port, or `undefined` for an error that is not one of
 * the port's (a bug, or a failure of the caller's own storage), which the caller lets propagate.
 */
export function classifyCommitError(error: unknown): ClassifiedCommitFailure | undefined {
  if (!(error instanceof GitCapabilityError)) {
    return undefined;
  }

  switch (error.code) {
    case 'COMMIT_BLOCKED': {
      const reason = error.reason ?? '';
      if (TRANSIENT_BLOCKED_REASONS.includes(reason)) {
        return withBlockedBy('transient', kebab(reason) ?? 'git-busy', reason);
      }

      if (PERMANENT_BLOCKED_REASONS.includes(reason)) {
        return withBlockedBy('permanent', reason, reason);
      }

      return withBlockedBy('permanent', 'commit-failed', reason);
    }

    case 'BRANCH_PROTECTED':
      return withBlockedBy(
        'permanent',
        error.reason === 'branch-not-allowed' ? 'branch-not-allowed' : 'branch-protected',
        error.reason,
      );
    case 'COMMIT_FAILED':
      return withBlockedBy('permanent', 'commit-failed', error.reason);
    case 'GIT_OPERATION_UNCERTAIN':
      // A Git that was never there ran nothing: that is not uncertain, it is a Git outage that passes.
      return error.reason === 'executable-unavailable'
        ? withBlockedBy('transient', 'git-unavailable', error.reason)
        : withBlockedBy('uncertain', 'uncertain', error.reason);
    case 'GIT_UNAVAILABLE':
      // A Git that cannot be found or started, one that hung, one short of resources (a lock,
      // descriptors, memory): an outage, retained and committed once Git works again.
      return error.reason === 'timeout'
        ? withBlockedBy('transient', 'git-timeout', error.reason)
        : withBlockedBy('transient', 'git-unavailable', error.reason);
    case 'GIT_OPERATION_FAILED':
      return withBlockedBy('transient', 'git-unavailable', error.reason);
    default:
      return withBlockedBy('permanent', 'commit-failed', error.reason);
  }
}
