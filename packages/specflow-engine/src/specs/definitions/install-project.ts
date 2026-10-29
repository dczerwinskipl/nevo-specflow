import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { sha256Hex } from '../../hash';
import { GitCapabilityError } from '../../git/errors';
import { executeGit } from '../../git/process';
import { openVersionControl } from '../../version-control';
import { engineCommitRefusal } from '../../version-control/commits/branch-patterns';
import type { EngineCommitRequest } from '../../version-control/commits/port';
import { inspectLocalBranches } from '../../version-control/git/branches';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import type { GitCommitsPolicy } from '../../version-control/worktrees/policy';
import { recordLedgerEntries, withLedgerLock } from '../durable';
import { pruneUncommitted } from '../uncommitted';
import { createFilesystemDefinitionWriter } from './filesystem-writer';
import {
  applyInstall,
  planInstall,
  type InstallInput,
  type InstallOptions,
  type InstallPlan,
  type InstallResult,
} from './install';
import { createDefaultDefinitionRegistry } from './kinds';
import { openSeedSource } from './seed';
import { DEFINITIONS_RELATIVE_PATH, createFilesystemDefinitionSource } from './source';

/**
 * Installing the shipped definitions into a Project Home (`definitions install`, `init`).
 *
 * Installed definitions are never left as an untracked dirty worktree: with Git enabled the files that
 * were written (and those a previous, interrupted install left uncommitted) are committed through the
 * same path-limited Engine commit capability Create uses (operation trailer, hooks off, protected
 * branch guard). A protected or not-allowed branch refuses BEFORE anything is written. With Git
 * disabled the install is a plain write.
 */

export interface InstallProjectOptions extends InstallOptions {
  /** The folder of the shipped definitions; default: the folder next to the Engine or the CLI bundle. */
  readonly seedDirectory?: string;
}

export interface InstalledCommit {
  readonly sha: string;
  /** Repository-relative paths in the commit. */
  readonly paths: readonly string[];
}

export interface InstallProjectResult extends InstallResult {
  /** The commit that holds the installed files; absent for a dry run, a refusal, Git disabled or nothing to commit. */
  readonly commit?: InstalledCommit;
}

const COMMIT_ROOT = DEFINITIONS_RELATIVE_PATH;

async function inputFor(
  homeRoot: string,
  options: InstallProjectOptions,
): Promise<{ input: InstallInput; installOptions: InstallOptions }> {
  const { seedDirectory, ...installOptions } = options;
  const seed = await openSeedSource(
    seedDirectory !== undefined ? { directory: seedDirectory } : {},
  );
  return {
    installOptions,
    input: {
      seed: seed.source,
      target: createFilesystemDefinitionSource(join(homeRoot, ...COMMIT_ROOT.split('/'))),
      writer: createFilesystemDefinitionWriter(homeRoot),
      registry: createDefaultDefinitionRegistry(),
      options: installOptions,
    },
  };
}

/**
 * Write the shipped definitions into a Project Home without committing anything. The lower-level
 * step of `init`, which commits after the project configuration exists; everything else uses
 * {@link installProjectDefinitions}.
 */
export async function installProjectDefinitionFiles(
  homeRoot: string,
  options: InstallProjectOptions = {},
): Promise<InstallResult> {
  const { input } = await inputFor(homeRoot, options);
  const outcome = await planInstall(input);
  if (outcome.status === 'refused' || options.dryRun === true) return { outcome, written: [] };
  return { outcome, written: await applyInstall(input, outcome.plan) };
}

/** Repository-relative paths of the files an install plan leaves in the definitions folder. */
function committablePaths(plan: InstallPlan): string[] {
  return plan.items
    .filter(
      (item) =>
        item.action === 'create' || item.action === 'overwrite' || item.action === 'unchanged',
    )
    .map((item) => `${COMMIT_ROOT}/${item.path}`);
}

function commitRequest(
  homeRoot: string,
  branch: string,
  paths: readonly string[],
): EngineCommitRequest {
  return {
    root: homeRoot,
    expectedBranch: branch,
    paths,
    operationId: randomUUID(),
    kind: 'definitions-install',
    subject: `definitions(install): ${paths.length} files`,
    body: 'Install the shipped definitions',
  };
}

/**
 * Refuse, without writing anything, when the Engine may not commit the definitions on the current
 * branch of the Project Home (protected or not-allowed branch, detached HEAD, a busy checkout).
 */
export async function assertDefinitionsCommittable(
  engine: SpecFlowEngine,
  paths: readonly string[],
): Promise<string | undefined> {
  const { policy } = await readProjectGitPolicy(engine.context);
  if (!policy.enabled) return undefined;
  const commits = openVersionControl(engine).commits;
  const root = engine.context.project.homeRoot;
  const branch = await commits.currentBranch(root);
  if (paths.length > 0) await commits.preflight(commitRequest(root, branch, paths));
  return branch;
}

/**
 * Records the paths of an install in the uncommitted-changes ledger (owner `definitions`) before they
 * are committed, so that what an interrupted install leaves is known to the Engine and Close refuses
 * until it is committed. The commit itself is NOT governed by the commit policy (ADR 0018 decision
 * 3), and a ledger that cannot take the entries never stops it: this is a safety net, best effort.
 */
async function registerPendingDefinitions(
  engine: SpecFlowEngine,
  request: EngineCommitRequest,
  head: string | undefined,
): Promise<void> {
  try {
    const root = engine.context.project.homeRoot;
    const paths = await Promise.all(
      request.paths.map(async (path) => ({
        path,
        postSha256: await readFile(join(root, path))
          .then((bytes) => sha256Hex(bytes))
          .catch(() => null),
      })),
    );
    await withLedgerLock(engine.context, () =>
      recordLedgerEntries(
        engine.context,
        {
          projectId: engine.context.project.projectId,
          workspaceId: engine.workspace.workspaceId,
          workspaceRoot: root,
          owner: { kind: 'definitions' },
        },
        {
          operationId: request.operationId,
          reason: 'abandoned',
          recordedAt: new Date().toISOString(),
          branch: request.expectedBranch,
          head: head ?? null,
          paths,
        },
      ),
    );
  } catch {
    // The commit below is the invariant; the ledger only remembers what it could not finish.
  }
}

/**
 * Commit the definitions files that are not committed yet: the written ones and any that an earlier
 * interrupted install left in the worktree. Nothing to commit is not an error. The paths are
 * recorded in the ledger first and pruned once the commit holds them.
 */
export async function commitInstalledDefinitions(
  engine: SpecFlowEngine,
  paths: readonly string[],
): Promise<InstalledCommit | undefined> {
  const { policy } = await readProjectGitPolicy(engine.context);
  if (!policy.enabled) return undefined;
  const commits = openVersionControl(engine).commits;
  const root = engine.context.project.homeRoot;
  const pending: string[] = [];
  for (const path of paths) {
    if ((await commits.inspectPaths(root, [path])).state !== 'committed') pending.push(path);
  }
  if (pending.length === 0) return undefined;
  const branch = await commits.currentBranch(root);
  const request = commitRequest(root, branch, pending);
  await registerPendingDefinitions(
    engine,
    request,
    await commits.head(root).catch(() => undefined),
  );
  const { sha } = await commits.commit(request);
  await pruneUncommitted(engine, { workspaceId: engine.workspace.workspaceId, commits }).catch(
    () => undefined,
  );
  return { sha, paths: pending };
}

/**
 * Plan, check that the files may be committed, write them and commit them. See the module comment.
 */
export async function installProjectDefinitions(
  engine: SpecFlowEngine,
  options: InstallProjectOptions = {},
): Promise<InstallProjectResult> {
  const homeRoot = engine.context.project.homeRoot;
  const { input } = await inputFor(homeRoot, options);
  const outcome = await planInstall(input);
  if (outcome.status === 'refused' || options.dryRun === true) return { outcome, written: [] };

  const paths = committablePaths(outcome.plan);
  await assertDefinitionsCommittable(engine, paths);
  const written = await applyInstall(input, outcome.plan);
  const commit = await commitInstalledDefinitions(engine, paths);
  return { outcome, written, ...(commit ? { commit } : {}) };
}

/** The branch `init` offers for the default definitions when the current branch may not take them. */
export const INITIAL_DEFINITIONS_BRANCH = 'nevo-specflow/definitions';

/**
 * The new branch `init` may put the default definitions on when the current branch is protected or
 * not allowed: {@link INITIAL_DEFINITIONS_BRANCH}, offered only when it does not exist yet and the
 * policy the wizard collected lets the Engine commit on it. `undefined` when there is nothing to offer
 * (Git disabled, no commits, a detached HEAD, a current branch that takes them, or a refused name).
 */
export async function initialDefinitionsBranchOffer(
  root: string,
  git: { readonly enabled: boolean; readonly commits?: Partial<GitCommitsPolicy> },
): Promise<string | undefined> {
  if (!git.enabled) return undefined;
  const { current, branches } = await inspectLocalBranches(root);
  if (current === undefined || branches.length === 0) return undefined;
  const policy = {
    protectedBranches: git.commits?.protectedBranches ?? [],
    ...(git.commits?.allowedBranches ? { allowedBranches: git.commits.allowedBranches } : {}),
  };
  if (engineCommitRefusal(policy, current) === undefined) return undefined;
  if (branches.includes(INITIAL_DEFINITIONS_BRANCH)) return undefined;
  return engineCommitRefusal(policy, INITIAL_DEFINITIONS_BRANCH) === undefined
    ? INITIAL_DEFINITIONS_BRANCH
    : undefined;
}

/**
 * Creates the offered branch at the current commit and switches the checkout to it (`git checkout -b`):
 * the working tree and the index stay exactly as they are, nothing is committed, and the protected
 * branch is left untouched. Refuses (`BRANCH_ALREADY_EXISTS`, `BRANCH_PROTECTED`) unless the offer
 * still stands, so the definitions can then be committed with the usual guard.
 */
export async function startInitialDefinitionsBranch(
  root: string,
  git: { readonly enabled: boolean; readonly commits?: Partial<GitCommitsPolicy> },
): Promise<string> {
  const offer = await initialDefinitionsBranchOffer(root, git);
  if (offer === undefined) {
    const { branches } = await inspectLocalBranches(root);
    throw branches.includes(INITIAL_DEFINITIONS_BRANCH)
      ? new GitCapabilityError(
          'BRANCH_ALREADY_EXISTS',
          `The branch '${INITIAL_DEFINITIONS_BRANCH}' already exists.`,
        )
      : new GitCapabilityError(
          'BRANCH_PROTECTED',
          `The Engine may not commit on '${INITIAL_DEFINITIONS_BRANCH}' either.`,
        );
  }
  const result = await executeGit(root, ['checkout', '-q', '-b', offer]);
  if (result.exitCode !== 0) {
    throw new GitCapabilityError(
      'GIT_OPERATION_FAILED',
      `The branch '${offer}' could not be created.`,
      result.stderr.trim() || undefined,
    );
  }
  return offer;
}

/**
 * Before `init` writes anything: refuse when Git will be enabled and the Engine may not commit on the
 * checkout's current branch under the policy the wizard collected. The same predicate the commit
 * capability applies, evaluated early so no file is written for a commit that would be refused.
 */
export async function assertInitialDefinitionsCommittable(
  root: string,
  git: { readonly enabled: boolean; readonly commits?: Partial<GitCommitsPolicy> },
): Promise<void> {
  if (!git.enabled) return;
  const { current, branches } = await inspectLocalBranches(root);
  if (branches.length === 0) {
    throw new GitCapabilityError(
      'COMMIT_BLOCKED',
      'The checkout cannot take an Engine commit right now.',
      'no-commits',
    );
  }
  if (current === undefined) {
    throw new GitCapabilityError(
      'COMMIT_BLOCKED',
      'The checkout cannot take an Engine commit right now.',
      'detached',
    );
  }
  const refusal = engineCommitRefusal(
    {
      protectedBranches: git.commits?.protectedBranches ?? [],
      ...(git.commits?.allowedBranches ? { allowedBranches: git.commits.allowedBranches } : {}),
    },
    current,
  );
  if (refusal) {
    throw new GitCapabilityError(
      'BRANCH_PROTECTED',
      'The Engine does not commit on this branch.',
      refusal,
    );
  }
}
