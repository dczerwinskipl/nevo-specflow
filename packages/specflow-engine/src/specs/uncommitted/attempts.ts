/**
 * The agent attempts whose commit failed (D15, D16), as Close reports them: their paths are listed
 * under the attempt, with the remedy "retry the attempt commit", instead of under the kind they
 * would otherwise fall in. The workflow supplies them through the opened Engine
 * (`SpecFlowEngine.failedAttemptCommits`); this module only shapes them for a refusal.
 */

/**
 * Why an agent attempt's own commit (D15) still waits, while it does: `attempt-commit-pending` (it
 * has not run yet, or a crash interrupted it), `attempt-commit-failed` (its last run failed, `code`;
 * the owner retries it). With Git on, every workflow write of the attempt's Specification (the
 * owner's Confirm and Reject included) is refused while it waits (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`),
 * so no owner change joins the agent's uncommitted work and the owner's commit never comes before it.
 * The workflow supplies it through the opened Engine (`SpecFlowEngine.attemptCommitWait`).
 */
export interface AttemptCommitWait {
  readonly reason: 'attempt-commit-pending' | 'attempt-commit-failed';
  readonly code?: string;
}

/**
 * The finished agent attempt of a Specification (or of one of its Tasks) whose own commit (D15)
 * still waits, named: while it waits, every workflow write of that Specification is refused
 * `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` before anything is written, so no owner change joins the
 * agent's uncommitted work. Retry commit (`step#attempt` of `subject`) runs it.
 */
export interface SpecificationAttemptCommitWait extends AttemptCommitWait {
  readonly attemptId: string;
  readonly subject: { readonly specId: string; readonly taskId?: string };
  readonly step: string;
  readonly attempt: number;
  /** The title of the attempt's step when it finished. */
  readonly stepTitle: string;
}

/** The attempt as a refusal names it: `Requirements (requirements#1 of Task api)`. */
export function namedAttempt(wait: SpecificationAttemptCommitWait): string {
  return `${wait.stepTitle || wait.step} (${wait.step}#${String(wait.attempt)}${
    wait.subject.taskId !== undefined ? ` of Task ${wait.subject.taskId}` : ''
  })`;
}

/** Where the commit of a waiting attempt stands, as a refusal says it. */
export function attemptCommitState(wait: SpecificationAttemptCommitWait): string {
  return wait.reason === 'attempt-commit-failed'
    ? `failed${wait.code !== undefined ? ` (${wait.code})` : ''}`
    : 'has not run yet';
}

/**
 * A finished agent attempt whose own commit (D15) waits (pending or failed), with the checkout paths
 * that commit takes: while it waits, no write but the attempt's own changes them (the document
 * writer refuses the others, `DOCUMENT_COMMITS_PENDING` with `cause: attempt-commit`), so the
 * attempt commit never meets another author's change in them.
 */
export interface AttemptCommitPathHold {
  readonly wait: SpecificationAttemptCommitWait;
  /** The Runtime invocations of the attempt's Turns: their writes are the attempt's own. */
  readonly invocations: ReadonlySet<string>;
  /** Checkout-relative, sorted: its ledger entries (the mixed ones included) and declared files. */
  readonly paths: readonly string[];
}

/**
 * The waiting attempt commits of a checkout (none with Git off), or `readable: false` when an
 * attempt journal or a ledger record cannot be read: what such a journal holds is unknown, so every
 * caller fails closed.
 */
export type AttemptCommitPathHolds =
  | { readonly readable: true; readonly holds: readonly AttemptCommitPathHold[] }
  | { readonly readable: false };

/** A finished agent attempt whose commit failed, with every path that commit would hold. */
export interface FailedAttemptCommit {
  readonly attemptId: string;
  readonly specId: string;
  /** The Task, for a Task's attempt. */
  readonly taskId?: string;
  readonly step: string;
  readonly attempt: number;
  readonly stepTitle: string;
  /** Why the commit failed (the post action's code). */
  readonly code: string;
  /** Checkout-relative, sorted: the attempt's ledger entries. */
  readonly paths: readonly string[];
  /** Checkout-relative, sorted: the files outside the ledger the agent declared. */
  readonly declared: readonly string[];
}

/** One failed attempt commit as a refusal names it: the first `named` of its `count` paths. */
export interface UncommittedAttempt extends Omit<FailedAttemptCommit, 'paths' | 'declared'> {
  readonly count: number;
  readonly paths: readonly string[];
}

/**
 * The attempts that hold some of `paths` (what a refusal reports), each with those of its paths
 * only (the first `named` of them), and the set of every path they take: the refusal lists those
 * under the attempt and leaves them out of its other kinds. `declared: 'always'` (the ledger hold,
 * which reads no Git) lists every declared file of an attempt whose commit failed as held too; else
 * only those of `paths`.
 */
export function attemptsHolding(
  attempts: readonly FailedAttemptCommit[],
  paths: Iterable<string>,
  named: number,
  declared: 'always' | 'when-present' = 'when-present',
): { readonly attempts: readonly UncommittedAttempt[]; readonly taken: ReadonlySet<string> } {
  const present = new Set(paths);
  const taken = new Set<string>();
  const held: UncommittedAttempt[] = [];
  for (const { declared: files, ...attempt } of attempts) {
    const mine = [
      ...attempt.paths.filter((path) => present.has(path)),
      ...files.filter((path) => declared === 'always' || present.has(path)),
    ]
      .filter((path, index, all) => !taken.has(path) && all.indexOf(path) === index)
      .sort();
    if (mine.length === 0) {
      continue;
    }

    for (const path of mine) {
      taken.add(path);
    }

    held.push({ ...attempt, count: mine.length, paths: mine.slice(0, named) });
  }

  return { attempts: held, taken };
}
