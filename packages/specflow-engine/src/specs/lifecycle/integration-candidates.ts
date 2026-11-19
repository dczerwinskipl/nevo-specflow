import { GitCapabilityError } from '../../git/errors';
import { executeGit } from '../../git/process';
import type { WorkspaceRegistration } from '../../project/workspace/registry/types';
import { isWorkspaceBranchName } from '../../project/workspace/registry/validation';
import { matchesWorktreeBranchPattern } from '../../version-control/worktrees/policy';
import {
  INTEGRATION_CANDIDATES_NAMED,
  OTHER_BRANCHES_NAMED,
  type IntegrationBranchCandidate,
  type IntegrationBranchCandidates,
  type IntegrationBranchFact,
} from './model';

/** The repository facts the candidates of a missing integration branch are derived from. */
export interface IntegrationBranchEvidence {
  /** Short names of the local branches. */
  readonly localBranches: readonly string[];
  /** The default branch of each remote that has a local `refs/remotes/<remote>/HEAD`. */
  readonly remoteDefaults: readonly { readonly remote: string; readonly branch: string }[];
  /** The branch the Specification's linked workspace was created from, when recorded. */
  readonly startedFrom?: string;
  /** The branch the primary checkout is attached to; absent when detached. */
  readonly primaryBranch?: string;
  /** The Specification's own linked branch: it cannot receive itself. */
  readonly ownBranch?: string;
  /** `git.worktrees.branchPattern`: branches it names are Specification branches, not offered. */
  readonly branchPattern: string;
}

const FACT_ORDER: readonly IntegrationBranchFact[] = [
  'remote-default',
  'started-from',
  'primary-checkout',
];

/** A remote name a blocker can carry (the contract bounds it like a branch name). */
function isRemoteName(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !/[\s\\]/u.test(value);
}

/**
 * Pure: every local branch a fact names becomes one candidate with all its facts, ordered by its
 * first fact. A fact about a branch that does not exist locally (a remote default never checked out,
 * a deleted start branch) names no candidate. Nothing is chosen. Only names a blocker can carry
 * (`isWorkspaceBranchName`) are offered.
 */
export function deriveIntegrationCandidates(
  evidence: IntegrationBranchEvidence,
): IntegrationBranchCandidates {
  const local = new Set(evidence.localBranches.filter((branch) => isWorkspaceBranchName(branch)));
  const offered = (branch: string | undefined): branch is string =>
    branch !== undefined && local.has(branch) && branch !== evidence.ownBranch;
  const byBranch = new Map<string, { facts: Set<IntegrationBranchFact>; remote?: string }>();
  const add = (branch: string, fact: IntegrationBranchFact, remote?: string) => {
    const entry = byBranch.get(branch) ?? { facts: new Set<IntegrationBranchFact>() };
    entry.facts.add(fact);
    if (remote !== undefined && entry.remote === undefined) {
      entry.remote = remote;
    }

    byBranch.set(branch, entry);
  };

  const remotes = evidence.remoteDefaults
    .filter(({ remote }) => isRemoteName(remote))
    .sort((a, b) =>
      a.remote === b.remote
        ? 0
        : a.remote === 'origin'
          ? -1
          : b.remote === 'origin'
            ? 1
            : a.remote < b.remote
              ? -1
              : 1,
    );
  for (const { remote, branch } of remotes) {
    if (offered(branch)) {
      add(branch, 'remote-default', remote);
    }
  }

  if (offered(evidence.startedFrom)) {
    add(evidence.startedFrom, 'started-from');
  }

  if (offered(evidence.primaryBranch)) {
    add(evidence.primaryBranch, 'primary-checkout');
  }

  // Map insertion order is the order of each branch's first fact.
  const candidates: IntegrationBranchCandidate[] = [...byBranch]
    .slice(0, INTEGRATION_CANDIDATES_NAMED)
    .map(([branch, entry]): IntegrationBranchCandidate => {
      const facts = FACT_ORDER.filter((fact) => entry.facts.has(fact));

      // A remote is recorded exactly with the remote-default fact.
      return entry.remote !== undefined
        ? { branch, facts, remote: entry.remote }
        : {
            branch,
            facts: facts.filter(
              (fact): fact is Exclude<IntegrationBranchFact, 'remote-default'> =>
                fact !== 'remote-default',
            ),
          };
    });
  const others = [...local]
    .filter(
      (branch) =>
        !byBranch.has(branch) &&
        branch !== evidence.ownBranch &&
        !matchesWorktreeBranchPattern(evidence.branchPattern, branch),
    )
    .sort();

  return {
    candidates,
    otherBranches: others.slice(0, OTHER_BRANCHES_NAMED),
    otherBranchCount: others.length,
  };
}

/** Git could not be read: the caller offers no candidates rather than hiding other preconditions. */
class CandidatesUnreadable extends Error {}

async function git(root: string, args: readonly string[]) {
  try {
    return await executeGit(root, args);
  } catch (error) {
    if (error instanceof GitCapabilityError) {
      throw new CandidatesUnreadable(error.message);
    }

    throw error;
  }
}

async function lines(root: string, args: readonly string[]): Promise<readonly string[]> {
  const result = await git(root, args);
  if (result.exitCode !== 0) {
    throw new CandidatesUnreadable('git ' + args[0] + ' failed.');
  }

  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

/** The local branch a checkout is attached to; `undefined` when detached (exit 1). */
async function attachedBranch(root: string): Promise<string | undefined> {
  const head = await git(root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (head.exitCode !== 0 && head.exitCode !== 1) {
    throw new CandidatesUnreadable('git symbolic-ref failed.');
  }

  const ref = head.exitCode === 0 ? head.stdout.trim() : '';

  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;
}

const NO_CANDIDATES: IntegrationBranchCandidates = {
  candidates: [],
  otherBranches: [],
  otherBranchCount: 0,
};

/**
 * Read-only (no fetch, no ref or config write): the local branches, the remote defaults from the
 * local `refs/remotes/<remote>/HEAD` symbolic refs, and the primary checkout's attached branch. When
 * Git cannot be read, no branch is offered (the lists are empty); the refusal it belongs to still
 * names every other precondition.
 */
export async function readIntegrationCandidates(input: {
  readonly primaryRoot: string;
  /** The Specification's checkout: its start branch is offered when it is linked. */
  readonly source: WorkspaceRegistration;
  /** The Specification's own linked branch, from the Close evidence; never offered. */
  readonly ownBranch?: string;
  readonly branchPattern: string;
}): Promise<IntegrationBranchCandidates> {
  try {
    // `lstrip=2` keeps the full branch name; `refname:short` would print `heads/<x>` when a tag or
    // another ref has the same name.
    const localBranches = await lines(input.primaryRoot, [
      'for-each-ref',
      '--format=%(refname:lstrip=2)',
      'refs/heads',
    ]);
    const remoteDefaults = (
      await lines(input.primaryRoot, [
        'for-each-ref',
        '--format=%(refname)%00%(symref)',
        'refs/remotes',
      ])
    ).flatMap((line) => {
      const [name = '', target = ''] = line.split('\0');
      if (!name.endsWith('/HEAD') || target === '') {
        return [];
      }

      const prefix = name.slice(0, -'HEAD'.length);
      const remote = prefix.slice('refs/remotes/'.length, -1);

      return target.startsWith(prefix) && remote !== ''
        ? [{ remote, branch: target.slice(prefix.length) }]
        : [];
    });
    const primaryBranch = await attachedBranch(input.primaryRoot);
    const linked = input.source.kind === 'linked';

    return deriveIntegrationCandidates({
      localBranches,
      remoteDefaults,
      ...(linked && input.source.startedFrom ? { startedFrom: input.source.startedFrom } : {}),
      ...(primaryBranch ? { primaryBranch } : {}),
      ...(linked && input.ownBranch ? { ownBranch: input.ownBranch } : {}),
      branchPattern: input.branchPattern,
    });
  } catch (error) {
    if (error instanceof CandidatesUnreadable) {
      return NO_CANDIDATES;
    }

    throw error;
  }
}
