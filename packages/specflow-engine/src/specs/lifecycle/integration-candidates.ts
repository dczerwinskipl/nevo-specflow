import { executeGit } from '../../git/process';
import type { WorkspaceRegistration } from '../../project/workspace/registry/types';
import { matchesWorktreeBranchPattern } from '../../version-control/worktrees/policy';
import {
  CloseOperationError,
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

/**
 * Pure: every local branch a fact names becomes one candidate with all its facts, ordered by its
 * first fact. A fact about a branch that does not exist locally (a remote default never checked out,
 * a deleted start branch) names no candidate. Nothing is chosen.
 */
export function deriveIntegrationCandidates(
  evidence: IntegrationBranchEvidence,
): IntegrationBranchCandidates {
  const local = new Set(evidence.localBranches);
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

  const remotes = [...evidence.remoteDefaults].sort((a, b) =>
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
    .map(([branch, entry]) => ({
      branch,
      facts: FACT_ORDER.filter((fact) => entry.facts.has(fact)),
      ...(entry.remote !== undefined ? { remote: entry.remote } : {}),
    }));
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

function unreadable(): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', 'The local branches cannot be read.');
}

async function lines(root: string, args: readonly string[]): Promise<readonly string[]> {
  const result = await executeGit(root, args);
  if (result.exitCode !== 0) {
    throw unreadable();
  }

  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

/** The local branch a checkout is attached to; `undefined` when detached (exit 1). */
async function attachedBranch(root: string): Promise<string | undefined> {
  const head = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (head.exitCode !== 0 && head.exitCode !== 1) {
    throw unreadable();
  }

  const ref = head.exitCode === 0 ? head.stdout.trim() : '';

  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;
}

/**
 * Read-only (no fetch, no ref or config write): the local branches, the remote defaults from the
 * local `refs/remotes/<remote>/HEAD` symbolic refs, and the primary checkout's attached branch.
 */
export async function readIntegrationCandidates(input: {
  readonly primaryRoot: string;
  /** The Specification's checkout: its branch is excluded and its start branch offered when linked. */
  readonly source: WorkspaceRegistration;
  readonly branchPattern: string;
}): Promise<IntegrationBranchCandidates> {
  const localBranches = await lines(input.primaryRoot, [
    'for-each-ref',
    '--format=%(refname:short)',
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
  const ownBranch = linked ? await attachedBranch(input.source.root) : undefined;

  return deriveIntegrationCandidates({
    localBranches,
    remoteDefaults,
    ...(linked && input.source.startedFrom ? { startedFrom: input.source.startedFrom } : {}),
    ...(primaryBranch ? { primaryBranch } : {}),
    ...(ownBranch ? { ownBranch } : {}),
    branchPattern: input.branchPattern,
  });
}
