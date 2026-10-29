import { GitCapabilityError } from '../../git/errors';
import { executeGit } from '../../git/process';
import { executeGitMutation } from '../../git/mutation';

export type GitRelationship = 'already-integrated' | 'fast-forward' | 'divergent';

/** Git-only inputs: Close journals and Engine context belong to the caller. */
export interface GitIntegrationProofInput {
  readonly root: string;
  readonly sourceCommit: string;
  readonly targetCommit: string;
}

export interface GitIntegrationEvidence {
  readonly relationship: GitRelationship;
  readonly sourceCommit: string;
  readonly targetCommit: string;
  readonly mergeBaseCommit: string;
  readonly sourceTree: string;
  readonly targetTree: string;
  /** Full branch path delta, not filtered to Specification files. */
  readonly changedPaths: readonly string[];
}

const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;

function conflict(message: string): GitCapabilityError {
  return new GitCapabilityError('GIT_OPERATION_FAILED', message);
}

async function requiredGitValue(
  root: string,
  args: readonly string[],
  explanation: string,
): Promise<string> {
  const result = await executeGit(root, args);
  const value = result.stdout.trim();
  if (result.exitCode !== 0 || !OBJECT_ID.test(value)) {
    throw conflict(explanation);
  }

  return value;
}

async function isAncestor(root: string, ancestor: string, descendant: string): Promise<boolean> {
  const result = await executeGit(root, ['merge-base', '--is-ancestor', ancestor, descendant]);
  if (result.exitCode === 0) {
    return true;
  }

  if (result.exitCode === 1) {
    return false;
  }

  throw conflict('Git ancestry inspection was inconclusive.');
}

/**
 * Pure read-only Git port: inspect pinned commit ancestry/tree/diff without
 * knowing Close operations, Project Home, registry or Specification identity.
 */
export async function inspectGitIntegrationEvidence(
  input: GitIntegrationProofInput,
): Promise<GitIntegrationEvidence> {
  const { root, sourceCommit, targetCommit } = input;
  if (!OBJECT_ID.test(sourceCommit) || !OBJECT_ID.test(targetCommit)) {
    throw conflict('Invalid pinned Git commit SHA.');
  }

  const [sourceTree, targetTree, mergeBaseResult, changedResult] = await Promise.all([
    requiredGitValue(
      root,
      ['rev-parse', '--verify', sourceCommit + '^{tree}'],
      'Missing source tree.',
    ),
    requiredGitValue(
      root,
      ['rev-parse', '--verify', targetCommit + '^{tree}'],
      'Missing target tree.',
    ),
    executeGit(root, ['merge-base', '--all', targetCommit, sourceCommit]),
    executeGit(root, [
      'diff',
      '--no-ext-diff',
      '--no-renames',
      '--name-only',
      '-z',
      targetCommit,
      sourceCommit,
    ]),
  ]);
  const bases = mergeBaseResult.stdout.trim().split(/\s+/u).filter(Boolean);
  if (mergeBaseResult.exitCode !== 0 || bases.length !== 1 || !OBJECT_ID.test(bases[0]!)) {
    throw conflict('Cannot prove a unique source/target merge base.');
  }

  if (changedResult.exitCode !== 0) {
    throw conflict('Cannot inspect the complete source-vs-target branch diff.');
  }

  const changedPaths = changedResult.stdout.split('\0').filter(Boolean);
  const relationship: GitRelationship =
    sourceCommit === targetCommit || (await isAncestor(root, sourceCommit, targetCommit))
      ? 'already-integrated'
      : (await isAncestor(root, targetCommit, sourceCommit))
        ? 'fast-forward'
        : 'divergent';

  return {
    relationship,
    sourceCommit,
    targetCommit,
    mergeBaseCommit: bases[0]!,
    sourceTree,
    targetTree,
    changedPaths,
  };
}

/**
 * One bounded mutating operation on the ALREADY checked-out target checkout.
 * The lifecycle caller must have persisted integration-publish-initiated and
 * verified checkout/ref ownership before invoking this narrow Git port.
 * No out-of-band Git mutation is serialized by this branch/HEAD recheck.
 * Post-effect physical verification and uncertain-outcome recovery remain mandatory.
 * Any Git failure is uncertain, including a nonzero exit after a hook.
 */
export async function publishGitFastForward(input: {
  readonly root: string;
  readonly expectedTargetCommit: string;
  readonly expectedTargetBranch: string;
  /** Verified empty hooks directory owned by the Engine, never the checkout. */
  readonly disabledHooksDirectory: string;
  readonly sourceCommit: string;
}): Promise<void> {
  const { root, expectedTargetCommit, expectedTargetBranch, disabledHooksDirectory, sourceCommit } =
    input;
  if (!OBJECT_ID.test(expectedTargetCommit) || !OBJECT_ID.test(sourceCommit)) {
    throw conflict('Invalid pinned Git commit for publication.');
  }

  // Checking HEAD SHA alone is insufficient: an unrelated local branch can
  // point at the same commit. Reject before executing any mutating Git command.
  const checkedOutBranch = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (
    checkedOutBranch.exitCode !== 0 ||
    checkedOutBranch.stdout.trim() !== 'refs/heads/' + expectedTargetBranch
  ) {
    throw conflict('Target changed its checked-out integration branch before publication.');
  }

  const observed = await requiredGitValue(root, ['rev-parse', '--verify', 'HEAD'], 'Missing HEAD.');
  if (observed !== expectedTargetCommit) {
    throw conflict('Target HEAD changed before Git fast-forward publication.');
  }

  const status = await executeGit(root, [
    '-c',
    'core.optionalLocks=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  if (status.exitCode !== 0 || status.stdout) {
    throw conflict('Target checkout is not clean immediately before publication.');
  }

  const result = await executeGitMutation(root, [
    '-c',
    'core.hooksPath=' + disabledHooksDirectory,
    'merge',
    '--ff-only',
    '--no-edit',
    sourceCommit,
  ]).catch((error: unknown) => {
    if (error instanceof GitCapabilityError) {
      throw error;
    }

    throw new GitCapabilityError(
      'GIT_OPERATION_UNCERTAIN',
      'Git publication outcome cannot be established without reconciliation.',
    );
  });
  if (result.exitCode !== 0) {
    throw new GitCapabilityError(
      'GIT_OPERATION_UNCERTAIN',
      'Git fast-forward reported a failure; verify physical checkout before retrying.',
    );
  }
}

/** Post-publication HEAD, index and physical worktree proof. */
export async function verifyPublishedGitCheckout(input: {
  readonly root: string;
  readonly expectedBranch: string;
  readonly expectedCommit: string;
  readonly expectedTree: string;
}): Promise<void> {
  const { root, expectedBranch, expectedCommit, expectedTree } = input;
  if (!OBJECT_ID.test(expectedCommit) || !OBJECT_ID.test(expectedTree)) {
    throw conflict('Invalid expected Git publication proof.');
  }

  const branch = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (branch.exitCode !== 0 || branch.stdout.trim() !== 'refs/heads/' + expectedBranch) {
    throw conflict('Checked-out target is no longer on its pinned branch.');
  }

  const head = await requiredGitValue(root, ['rev-parse', '--verify', 'HEAD'], 'Missing HEAD.');
  if (head !== expectedCommit) {
    throw conflict('Target HEAD does not match publication commit.');
  }

  const tree = await requiredGitValue(
    root,
    ['rev-parse', '--verify', expectedCommit + '^{tree}'],
    'Missing publication tree.',
  );
  if (tree !== expectedTree) {
    throw conflict('Published commit tree differs from pinned proof.');
  }

  const indexTree = await executeGit(root, ['write-tree']);
  if (indexTree.exitCode !== 0 || indexTree.stdout.trim() !== expectedTree) {
    throw conflict('Target index does not match published commit tree.');
  }

  const status = await executeGit(root, [
    '-c',
    'core.optionalLocks=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  if (status.exitCode !== 0 || status.stdout) {
    throw conflict('Target physical files differ from published index/HEAD.');
  }
}

/**
 * A later target commit may be a descendant of source while rewriting this
 * Specification. Exact tree-path proof prevents accepting stale/changed
 * Specification content solely because Git ancestry reports success.
 */
export async function verifyGitTreePathEquivalent(
  root: string,
  sourceCommit: string,
  destinationCommit: string,
  path: string,
): Promise<void> {
  if (!OBJECT_ID.test(sourceCommit) || !OBJECT_ID.test(destinationCommit)) {
    throw conflict('Invalid source or destination commit identity.');
  }

  if (!/^specs\/(?:active|archive)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(path)) {
    throw conflict('Invalid canonical Specification subtree path.');
  }

  const [source, destination] = await Promise.all([
    requiredGitValue(
      root,
      ['rev-parse', '--verify', sourceCommit + ':' + path],
      'Missing source Spec subtree.',
    ),
    requiredGitValue(
      root,
      ['rev-parse', '--verify', destinationCommit + ':' + path],
      'Missing destination Spec subtree.',
    ),
  ]);
  if (source !== destination) {
    throw conflict('Canonical Specification subtree differs in target.');
  }
}
