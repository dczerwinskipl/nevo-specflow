import { isDeepStrictEqual } from 'node:util';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { GIT_INSTANCE_SENTINEL_FILE, verifyGitInstance } from '../git-instance';
import { PROJECT_HOME_MARKER_RELATIVE_PATH, type ResolvedProjectHome } from './home';

interface PhysicalEntry {
  readonly path: string;
  readonly kind: 'missing' | 'directory' | 'file';
  readonly device?: number;
  readonly inode?: number;
  readonly bytes?: string;
}

/**
 * Git checks and uniqueness discovery happen before acquiring the control lock.
 * Record their physical authority while still outside it. The lock-side verifier
 * must use only filesystem calls; it must not start Git while holding the lock.
 */
export async function captureProjectHomeLockProof(
  context: ResolvedProjectHome,
): Promise<readonly PhysicalEntry[]> {
  return physicalAuthority(context);
}

export async function assertProjectHomeLockProof(
  context: ResolvedProjectHome,
  before: readonly PhysicalEntry[],
): Promise<void> {
  const current = await physicalAuthority(context);
  if (!isDeepStrictEqual(current, before)) {
    throw new Error('Project Home identity or Git worktree authority changed before mutation.');
  }

  // The sentinel binds the physical Git incarnation to the designated home.
  // This function uses only lstat/readFile; it does not execute Git.
  await verifyGitInstance(
    context.project.gitCommonDir,
    context.project.projectId,
    context.project.gitInstanceId,
  );
}

async function physicalAuthority(context: ResolvedProjectHome): Promise<PhysicalEntry[]> {
  const { homeRoot, gitCommonDir, stateRoot, projectConfigPath } = context.project;
  const roots = [homeRoot, context.workspace.root];
  const entries = [
    ...roots.flatMap((root) => [root, join(root, '.git')]),
    gitCommonDir,
    join(gitCommonDir, 'config'),
    join(gitCommonDir, 'info', 'exclude'),
    join(gitCommonDir, GIT_INSTANCE_SENTINEL_FILE),
    join(homeRoot, '.nevo'),
    join(homeRoot, '.nevo', 'local'),
    stateRoot,
    projectConfigPath,
    join(homeRoot, '.gitignore'),
    join(homeRoot, PROJECT_HOME_MARKER_RELATIVE_PATH),
  ];
  const worktrees = join(gitCommonDir, 'worktrees');
  const names = await childDirectoryNames(worktrees);
  entries.push(worktrees);
  for (const name of names) {
    const admin = join(worktrees, name);
    const gitdir = join(admin, 'gitdir');
    entries.push(admin, gitdir, join(admin, 'commondir'));
    const path = await readOptionalText(gitdir);
    if (path) {
      const pointer = path.trim();
      const linkedGitFile = isAbsolute(pointer) ? pointer : resolve(admin, pointer);
      entries.push(linkedGitFile, join(dirname(linkedGitFile), PROJECT_HOME_MARKER_RELATIVE_PATH));
    }
  }

  const unique = [...new Set(entries)].sort();

  return Promise.all(unique.map(readPhysicalEntry));
}

async function childDirectoryNames(path: string): Promise<string[]> {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) {
      throw new Error('Git worktree admin metadata directory is redirected.');
    }

    return (await readdir(path)).sort();
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }

    throw error;
  }
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Git worktree metadata is redirected.');
    }

    return readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readPhysicalEntry(path: string): Promise<PhysicalEntry> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      throw new Error('Project Home authority is redirected or not a regular filesystem entry.');
    }

    if (stat.isDirectory()) {
      if ((await realpath(path)) !== path) {
        throw new Error('Project Home authority directory is redirected.');
      }

      return { path, kind: 'directory', device: stat.dev, inode: stat.ino };
    }

    return {
      path,
      kind: 'file',
      device: stat.dev,
      inode: stat.ino,
      bytes: await readFile(path, 'utf8'),
    };
  } catch (error) {
    if (isMissing(error)) {
      return { path, kind: 'missing' };
    }

    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
