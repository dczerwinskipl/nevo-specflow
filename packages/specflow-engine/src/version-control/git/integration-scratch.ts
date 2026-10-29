import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GitCapabilityError } from '../../git/errors';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;

function invalid(message: string): GitCapabilityError {
  return new GitCapabilityError('GIT_OPERATION_FAILED', message);
}

async function gitValue(root: string, args: readonly string[]): Promise<string> {
  const result = await executeGit(root, args);
  const value = result.stdout.trim();
  if (result.exitCode !== 0 || !SHA.test(value)) {
    throw invalid('Cannot prove pinned scratch Git object.');
  }

  return value;
}

/**
 * This is deliberately a mutation: even a Git worktree add interrupted before
 * its subprocess exits may leave a registered checkout. The caller must FIRST
 * persist its unique path/instance intent, and must NEVER blindly rerun it.
 */
export async function createDetachedIntegrationCheckout(input: {
  readonly projectRoot: string;
  readonly scratchRoot: string;
  readonly targetCommit: string;
  readonly hooksDirectory: string;
}): Promise<void> {
  const { projectRoot, scratchRoot, targetCommit, hooksDirectory } = input;
  if (!SHA.test(targetCommit)) {
    throw invalid('Invalid pinned target commit.');
  }

  const result = await executeGitMutation(projectRoot, [
    '-c',
    'core.hooksPath=' + hooksDirectory,
    'worktree',
    'add',
    '--detach',
    '--',
    scratchRoot,
    targetCommit,
  ]);
  if (result.exitCode !== 0) {
    throw new GitCapabilityError(
      'GIT_OPERATION_UNCERTAIN',
      'Scratch checkout creation failed or was interrupted; reconcile physical registration.',
    );
  }
}

/** A full detached checkout is verified before any merge subprocess starts. */
export async function inspectDetachedIntegrationCheckout(input: {
  readonly root: string;
  readonly expectedGitCommonDir: string;
  readonly expectedCommit: string;
  readonly requireClean: boolean;
}): Promise<void> {
  const { root, expectedGitCommonDir, expectedCommit, requireClean } = input;
  const [toplevel, common, symbolic, head] = await Promise.all([
    executeGit(root, ['rev-parse', '--show-toplevel']),
    executeGit(root, ['rev-parse', '--git-common-dir']),
    executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']),
    gitValue(root, ['rev-parse', '--verify', 'HEAD']),
  ]);
  if (
    toplevel.exitCode !== 0 ||
    (await realpath(toplevel.stdout.trim())) !== root ||
    common.exitCode !== 0 ||
    (await realpath(resolve(root, common.stdout.trim()))) !== expectedGitCommonDir ||
    symbolic.exitCode !== 1 ||
    head !== expectedCommit
  ) {
    throw invalid('Scratch is not the expected detached checkout of this Git instance.');
  }

  if (requireClean) {
    const status = await executeGit(root, [
      '-c',
      'core.optionalLocks=false',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]);
    if (status.exitCode !== 0 || status.stdout) {
      throw invalid('Scratch has uncommitted or untracked files.');
    }
  }
}

export type DetachedScratchMerge =
  | {
      readonly status: 'candidate';
      readonly candidateCommit: string;
      readonly candidateTree: string;
    }
  | {
      readonly status: 'conflict';
      readonly conflictPaths: readonly string[];
      readonly conflictIndexHash: string;
    };

/** Always merges INSIDE scratch; never changes checked-out primary. */
export async function mergeDivergentInScratch(input: {
  readonly scratchRoot: string;
  readonly sourceCommit: string;
  readonly targetCommit: string;
  readonly hooksDirectory: string;
}): Promise<DetachedScratchMerge> {
  const { scratchRoot, sourceCommit, targetCommit, hooksDirectory } = input;
  if (!SHA.test(sourceCommit) || !SHA.test(targetCommit)) {
    throw invalid('Invalid pinned source/target commit.');
  }

  const result = await executeGitMutation(scratchRoot, [
    '-c',
    'core.hooksPath=' + hooksDirectory,
    '-c',
    'commit.gpgSign=false',
    '-c',
    'merge.gpgSign=false',
    '-c',
    'rerere.enabled=false',
    '-c',
    'user.name=Nevo SpecFlow Engine',
    '-c',
    'user.email=engine@nevo.invalid',
    'merge',
    '--no-ff',
    '--no-edit',
    sourceCommit,
  ]);
  if (result.exitCode === 0) {
    const [candidateCommit, candidateTree] = await Promise.all([
      gitValue(scratchRoot, ['rev-parse', '--verify', 'HEAD']),
      gitValue(scratchRoot, ['rev-parse', '--verify', 'HEAD^{tree}']),
    ]);

    return { status: 'candidate', candidateCommit, candidateTree };
  }

  // Only positive unmerged-index evidence means a KNOWN conflict. Other Git
  // failures (hook, access, signal, timeout) have unknown effects.
  const unmerged = await executeGit(scratchRoot, ['ls-files', '--unmerged', '-z']);
  if (unmerged.exitCode !== 0 || !unmerged.stdout) {
    throw new GitCapabilityError(
      'GIT_OPERATION_UNCERTAIN',
      'Scratch merge ended without provable conflict index; explicit recovery required.',
    );
  }

  const conflictPaths = [
    ...new Set(
      unmerged.stdout
        .split('\0')
        .filter(Boolean)
        .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
    ),
  ].sort();
  if (conflictPaths.some((value) => !value || value.includes('\0'))) {
    throw invalid('Scratch unmerged paths cannot be interpreted safely.');
  }

  return {
    status: 'conflict',
    conflictPaths,
    conflictIndexHash: createHash('sha256').update(unmerged.stdout, 'utf8').digest('hex'),
  };
}

/** Verify exact parents, complete tree, index, checkout, and canonical Spec bytes. */
export async function verifyIntegrationCandidate(input: {
  readonly scratchRoot: string;
  readonly expectedGitCommonDir: string;
  readonly targetCommit: string;
  readonly sourceCommit: string;
  readonly candidateCommit: string;
  readonly candidateTree: string;
  readonly specificationPath: string;
}): Promise<void> {
  const {
    scratchRoot,
    expectedGitCommonDir,
    targetCommit,
    sourceCommit,
    candidateCommit,
    candidateTree,
    specificationPath,
  } = input;
  if (
    !SHA.test(targetCommit) ||
    !SHA.test(sourceCommit) ||
    !SHA.test(candidateCommit) ||
    !SHA.test(candidateTree) ||
    !/^specs\/(?:active|archive)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(specificationPath)
  ) {
    throw invalid('Invalid pinned merge candidate proof.');
  }

  await inspectDetachedIntegrationCheckout({
    root: scratchRoot,
    expectedGitCommonDir,
    expectedCommit: candidateCommit,
    requireClean: true,
  });

  const [parents, tree, indexTree, sourceSpec, mergedSpec] = await Promise.all([
    executeGit(scratchRoot, ['rev-list', '--parents', '-n', '1', candidateCommit]),
    gitValue(scratchRoot, ['rev-parse', '--verify', candidateCommit + '^{tree}']),
    gitValue(scratchRoot, ['write-tree']),
    gitValue(scratchRoot, ['rev-parse', '--verify', sourceCommit + ':' + specificationPath]),
    gitValue(scratchRoot, ['rev-parse', '--verify', candidateCommit + ':' + specificationPath]),
  ]);
  if (
    parents.exitCode !== 0 ||
    parents.stdout.trim() !== [candidateCommit, targetCommit, sourceCommit].join(' ') ||
    tree !== candidateTree ||
    indexTree !== candidateTree ||
    sourceSpec !== mergedSpec
  ) {
    throw invalid('Scratch merge candidate is not the exact intended two-parent Git result.');
  }
}

/**
 * Independent read-only fingerprint of a known conflict. The scratch must
 * remain on the pinned detached target with the exact source MERGE_HEAD.
 * A matching journal string alone is never authority to settle or dispose.
 */
export async function verifyIsolatedMergeConflict(input: {
  readonly scratchRoot: string;
  readonly expectedGitCommonDir: string;
  readonly targetCommit: string;
  readonly sourceCommit: string;
  readonly conflictPaths: readonly string[];
  readonly conflictIndexHash: string;
}): Promise<void> {
  const {
    scratchRoot,
    expectedGitCommonDir,
    targetCommit,
    sourceCommit,
    conflictPaths,
    conflictIndexHash,
  } = input;
  if (
    !SHA.test(targetCommit) ||
    !SHA.test(sourceCommit) ||
    !/^[a-f0-9]{64}$/iu.test(conflictIndexHash)
  ) {
    throw invalid('Invalid conflict evidence.');
  }

  await inspectDetachedIntegrationCheckout({
    root: scratchRoot,
    expectedGitCommonDir,
    expectedCommit: targetCommit,
    requireClean: false,
  });
  const [mergeHead, originalHead, staged] = await Promise.all([
    gitValue(scratchRoot, ['rev-parse', '--verify', 'MERGE_HEAD']),
    gitValue(scratchRoot, ['rev-parse', '--verify', 'ORIG_HEAD']),
    executeGit(scratchRoot, ['ls-files', '--unmerged', '-z']),
  ]);
  if (staged.exitCode !== 0 || !staged.stdout) {
    throw invalid('The conflicting scratch no longer contains an unmerged index.');
  }

  const observedPaths = [
    ...new Set(
      staged.stdout
        .split('\0')
        .filter(Boolean)
        .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
    ),
  ].sort();
  const hash = createHash('sha256').update(staged.stdout, 'utf8').digest('hex');
  if (
    mergeHead !== sourceCommit ||
    originalHead !== targetCommit ||
    hash !== conflictIndexHash ||
    observedPaths.join('\0') !== conflictPaths.join('\0')
  ) {
    throw invalid('Scratch merge parents or exact unmerged-index evidence changed.');
  }
}
