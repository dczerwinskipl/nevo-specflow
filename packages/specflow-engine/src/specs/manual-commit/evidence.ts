/**
 * What the repository says about a manual commit that may have been made already (ADR 0016 decision
 * 13, applied by ADR 0018 decision 8): a commit found by its `Nevo-Operation` trailer is the manual
 * commit only when it touches nothing outside the snapshot AND HEAD holds the recorded content of every
 * path; the trailer alone proves nothing, because the committer address is public. Reads only.
 */
import type { CommitPort } from '../../version-control/commits/port';
import type { ManualCommitJournal } from './model';
import type { SnapshotEntry } from './payload';
import { readWorkingContents } from './working';

export type CommitEvidence =
  /** The manual commit is committed: `sha` carries its trailer. */
  | { readonly kind: 'committed'; readonly sha: string; readonly paths: readonly string[] }
  /** A commit carries the operation's trailer but is not the commit that was asked for. */
  | { readonly kind: 'foreign-commit' }
  /** The recorded parent is no longer an ancestor of HEAD: history was rewritten. */
  | { readonly kind: 'history-changed' }
  /** No commit carries the trailer. */
  | { readonly kind: 'absent' };

export async function lookUpCommit(
  commits: CommitPort,
  journal: ManualCommitJournal,
  entries: readonly SnapshotEntry[],
): Promise<CommitEvidence> {
  const root = journal.workspaceRoot;
  const found = await commits.findByOperation(root, journal.operationId, journal.parentHead!);
  if (found.status === 'history-changed') {
    return { kind: 'history-changed' };
  }

  if (found.status === 'absent') {
    return { kind: 'absent' };
  }

  const known = new Map(entries.map((entry) => [entry.path, entry]));
  if (found.paths.some((path) => !known.has(path))) {
    return { kind: 'foreign-commit' };
  }

  if (!(await headHoldsSnapshot(commits, root, entries, found.paths))) {
    return { kind: 'foreign-commit' };
  }

  return { kind: 'committed', sha: found.sha, paths: found.paths };
}

/**
 * Whether HEAD holds the recorded content of every path the commit changed, and nothing of the
 * snapshot is still waiting for a commit: no path differs from HEAD, and each of `committed` is, in
 * the working tree too, exactly its recorded post-image. A path that equals HEAD but was not part of
 * the commit did not change (it equalled HEAD before): it needs no check.
 */
export async function headHoldsSnapshot(
  commits: CommitPort,
  root: string,
  entries: readonly SnapshotEntry[],
  committed: readonly string[],
): Promise<boolean> {
  const split = await commits.effectivePaths(
    root,
    entries.map((entry) => entry.path),
  );
  if (split.effective.length > 0) {
    return false;
  }

  const wanted = new Set(committed);
  const subset = entries.filter((entry) => wanted.has(entry.path));
  const working = await readWorkingContents(
    root,
    subset.map((entry) => entry.path),
  );

  return subset.every((entry) => working.get(entry.path) === entry.postSha256);
}

/**
 * Whether the commit `sha` holds the recorded post state of every path it was asked to commit: the
 * committed blob is exactly the working file and the working file is the recorded post-image; a
 * removed file is absent from the commit. A foreign write that landed between the check and `git add`
 * shows here. Paths that were dropped from the effective set did not change and are not checked.
 */
export async function commitHoldsEntries(
  commits: CommitPort,
  root: string,
  entries: readonly SnapshotEntry[],
  effective: readonly string[],
  sha: string,
): Promise<boolean> {
  const wanted = new Set(effective);
  const subset = entries.filter((entry) => wanted.has(entry.path));
  if (subset.length === 0) {
    return true;
  }

  const facts = await commits.pathFacts(
    root,
    subset.map((entry) => entry.path),
    sha,
  );
  const byPath = new Map(facts.map((fact) => [fact.path, fact]));
  const working = await readWorkingContents(
    root,
    subset.map((entry) => entry.path),
  );

  return subset.every((entry) => {
    const fact = byPath.get(entry.path);
    if (fact === undefined) {
      return false;
    }

    if (entry.postSha256 === null) {
      return fact.head === null && working.get(entry.path) === null;
    }

    return (
      fact.head !== null &&
      fact.head === fact.working &&
      working.get(entry.path) === entry.postSha256
    );
  });
}

/**
 * Decisive evidence that an attempt whose outcome was uncertain did NOT commit: no commit carries the
 * operation's trailer, HEAD is still the recorded parent, and the repository can take a commit now
 * (the port's preflight passes, which also means there is no `index.lock`). Anything else is not
 * decisive.
 */
export async function provablyNotCommitted(
  commits: CommitPort,
  journal: ManualCommitJournal,
  paths: readonly string[],
): Promise<boolean> {
  try {
    const root = journal.workspaceRoot;
    const found = await commits.findByOperation(root, journal.operationId, journal.parentHead!);
    if (found.status !== 'absent') {
      return false;
    }

    if ((await commits.head(root)) !== journal.parentHead) {
      return false;
    }

    await commits.preflight({
      root,
      expectedBranch: journal.branch,
      paths,
      operationId: journal.operationId,
      kind: 'manual-commit',
      subject: 'preflight',
    });

    return true;
  } catch {
    return false;
  }
}
