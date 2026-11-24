/**
 * The holds of the finished agent attempts whose own commit (D15) waits: the one source of truth
 * every admission asks ({@link AttemptCommitHolds}). The workflow computes them from its attempt
 * journals and the ledger (`workflow/agent/finalize/attempt-commit/holds.ts`) and supplies them
 * through the opened Engine (`SpecFlowEngine.attemptCommitHolds`); this module holds their shape,
 * the shapes the refusals list them in (D16) and the proof the attempt commit carries.
 */

/**
 * Why an agent attempt's own commit (D15) still waits, while it does: `attempt-commit-pending` (it
 * has not run yet, or a crash interrupted it), `attempt-commit-failed` (its last run failed, `code`;
 * the owner retries it). With Git on, every workflow write of the attempt's Specification (the
 * owner's Confirm and Reject included) is refused while it waits (`WORKFLOW_ATTEMPT_COMMIT_REQUIRED`),
 * so no owner change joins the agent's uncommitted work and the owner's commit never comes before it.
 * Each {@link AttemptCommitPathHold} carries it.
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
 * writer refuses the others, `DOCUMENT_COMMITS_PENDING` with `cause: attempt-commit`), no commit but
 * the attempt's own takes them (the manual commit refuses the same way) and Close never accepts
 * them into its archive commit, so the attempt commit never meets another author's change in them.
 */
export interface AttemptCommitPathHold {
  readonly wait: SpecificationAttemptCommitWait;
  /** The Runtime invocations of the attempt's Turns: their writes are the attempt's own. */
  readonly invocations: ReadonlySet<string>;
  /** Checkout-relative, sorted: the attempt's ledger entries, the mixed ones included. */
  readonly ledger: readonly string[];
  /** Checkout-relative, sorted: the files outside the ledger the agent declared. */
  readonly declared: readonly string[];
  /** Checkout-relative, sorted: `ledger` and `declared`, each once. */
  readonly paths: readonly string[];
}

/**
 * THE answer to "which uncommitted paths of a checkout does a finished agent attempt hold, and which
 * operation may take them" (`SpecFlowEngine.attemptCommitHolds`, keyed by the checkout of the
 * Specification): the waiting attempt commits (none with Git off), and `executions`, the Runtime
 * invocations whose ledger entries an attempt commit still takes (the Turns of an attempt in
 * progress, or of a held one), which the owner's commit of the execution state leaves out.
 * `readable: false` when an attempt journal or a ledger record cannot be read (or a listing was cut
 * short): what it holds is unknown, so every caller fails closed. Workflow admission, document
 * admission, the manual commit, Close and the owner's commit of the execution state all ask it.
 */
export type AttemptCommitHolds =
  | {
      readonly readable: true;
      readonly holds: readonly AttemptCommitPathHold[];
      readonly executions: ReadonlySet<string>;
    }
  | { readonly readable: false };

/** The holds when every record could be read. */
export type ReadableAttemptCommitHolds = Extract<AttemptCommitHolds, { readable: true }>;

/** No attempt holds anything (no workflow composed, or Git off). */
export const NO_ATTEMPT_COMMIT_HOLDS: AttemptCommitHolds = {
  readable: true,
  holds: [],
  executions: new Set(),
};

/** What the code of an attempt whose commit has not run yet is, where a refusal lists it. */
export const ATTEMPT_COMMIT_PENDING_CODE = 'ATTEMPT_COMMIT_PENDING';

/** A finished agent attempt whose commit waits, as Close lists it, with every path it holds. */
export interface WaitingAttemptCommit {
  readonly attemptId: string;
  readonly specId: string;
  /** The Task, for a Task's attempt. */
  readonly taskId?: string;
  readonly step: string;
  readonly attempt: number;
  readonly stepTitle: string;
  /** Why the commit failed (the post action's code), or {@link ATTEMPT_COMMIT_PENDING_CODE}. */
  readonly code: string;
  /** Checkout-relative, sorted: the attempt's ledger entries. */
  readonly paths: readonly string[];
  /** Checkout-relative, sorted: the files outside the ledger the agent declared. */
  readonly declared: readonly string[];
}

/** The holds as Close lists them (pending and failed alike). */
export function waitingAttemptCommits(
  holds: ReadableAttemptCommitHolds,
): readonly WaitingAttemptCommit[] {
  return holds.holds.map(({ wait, ledger, declared }) => ({
    attemptId: wait.attemptId,
    specId: wait.subject.specId,
    ...(wait.subject.taskId !== undefined ? { taskId: wait.subject.taskId } : {}),
    step: wait.step,
    attempt: wait.attempt,
    stepTitle: wait.stepTitle,
    code:
      wait.reason === 'attempt-commit-failed'
        ? (wait.code ?? 'FAILED')
        : ATTEMPT_COMMIT_PENDING_CODE,
    paths: ledger,
    declared,
  }));
}

/** Every path the holds take (checkout-relative). */
export function heldPaths(holds: ReadableAttemptCommitHolds): Set<string> {
  return new Set(holds.holds.flatMap((hold) => hold.paths));
}

const authorities = new WeakSet<object>();

/**
 * The in-process proof that a manual commit IS the attempt commit of `attemptId` (D15): the one
 * commit exempt from that attempt's own hold (no other attempt's). Minted only by the attempt commit
 * runner (`workflow/agent/finalize/attempt-commit/run.ts`) for the attempt it commits; no transport
 * can carry it (it is an object identity, never a field of a request), and a copy is no proof.
 */
export interface AttemptCommitAuthority {
  readonly attemptId: string;
}

/** Mints the {@link AttemptCommitAuthority} of the attempt commit of `attemptId`. */
export function mintAttemptCommitAuthority(attemptId: string): AttemptCommitAuthority {
  const authority = Object.freeze({ attemptId });
  authorities.add(authority);

  return authority;
}

/** Whether `authority` proves the commit is the attempt commit of the attempt `hold` waits for. */
export function isOwnAttemptCommit(
  authority: AttemptCommitAuthority | undefined,
  hold: Pick<AttemptCommitPathHold, 'wait'>,
): boolean {
  return (
    authority !== undefined &&
    authorities.has(authority) &&
    authority.attemptId === hold.wait.attemptId
  );
}

/** One waiting attempt commit as a refusal names it: the first `named` of its `count` paths. */
export interface UncommittedAttempt extends Omit<WaitingAttemptCommit, 'paths' | 'declared'> {
  readonly count: number;
  readonly paths: readonly string[];
}

/**
 * The attempts that hold some of `paths` (what a refusal reports), each with those of its paths
 * only (the first `named` of them), and the set of every path they take: the refusal lists those
 * under the attempt and leaves them out of its other kinds. `declared: 'always'` (the ledger hold,
 * which reads no Git) lists every declared file of a waiting attempt as held too; else
 * only those of `paths`.
 */
export function attemptsHolding(
  attempts: readonly WaitingAttemptCommit[],
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
