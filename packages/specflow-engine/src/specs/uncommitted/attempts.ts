/**
 * The agent attempts whose commit failed (D15, D16), as Close reports them: their paths are listed
 * under the attempt, with the remedy "retry the attempt commit", instead of under the kind they
 * would otherwise fall in. The workflow supplies them through the opened Engine
 * (`SpecFlowEngine.failedAttemptCommits`); this module only shapes them for a refusal.
 */

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
