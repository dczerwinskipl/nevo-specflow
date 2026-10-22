import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { verifyGitInstance } from './git-instance';
import { PROJECT_HOME_MARKER_RELATIVE_PATH, type ResolvedProjectHome } from './project-home';
import { WorkspaceRegistryError } from './workspace-registry-types';
import { pathKey } from './workspace-registry-validation';

/**
 * Filesystem-only evidence used by READ paths instead of Git (no child process).
 *
 * Trust model: the Project Home identity in `ResolvedProjectHome` was proven
 * with Git once, when the Engine was opened. A read only checks that the
 * on-disk evidence that identity was derived from still agrees with it.
 */

/** The home marker and the Git instance sentinel still carry the identity proven at open. */
export async function verifyProjectHomeOnDisk(context: ResolvedProjectHome): Promise<void> {
  const markerPath = join(context.project.homeRoot, PROJECT_HOME_MARKER_RELATIVE_PATH);
  let marker: unknown;
  try {
    const stat = await lstat(markerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    marker = JSON.parse(await readFile(markerPath, 'utf8')) as unknown;
  } catch {
    throw mismatch('Project Home marker is missing, corrupt or redirected.');
  }
  if (
    !isRecord(marker) ||
    marker.version !== 1 ||
    marker.projectId !== context.project.projectId ||
    marker.homeRoot !== context.project.homeRoot ||
    marker.gitCommonDir !== context.project.gitCommonDir ||
    marker.gitInstanceId !== context.project.gitInstanceId
  ) {
    throw mismatch('Project Home designation differs from the identity verified at open.');
  }
  await verifyGitInstance(
    context.project.gitCommonDir,
    context.project.projectId,
    context.project.gitInstanceId,
  );
}

/**
 * Proves from the checkout's own `.git` link that `root` is a worktree of the
 * repository whose common directory the Engine verified at open:
 * - `.git` directory: its realpath must be the common directory;
 * - `.git` file (`gitdir: <common>/worktrees/<name>`): the pointed admin directory
 *   must live under the common directory and must point back (`gitdir` file) to
 *   this very `.git` file, so a copied or replaced checkout is rejected.
 */
export async function verifyCheckoutOnDisk(
  context: ResolvedProjectHome,
  root: string,
): Promise<void> {
  const commonDir = context.project.gitCommonDir;
  const link = join(root, '.git');
  let stat;
  try {
    stat = await lstat(link);
  } catch {
    throw mismatch('Workspace has no Git checkout link.');
  }
  if (stat.isSymbolicLink()) throw mismatch('Workspace Git link is redirected.');
  if (stat.isDirectory()) {
    if (!same(await realpath(link), commonDir)) {
      throw mismatch('Workspace belongs to a different Git repository.');
    }
    return;
  }
  if (!stat.isFile()) throw mismatch('Workspace Git link is not a file or directory.');

  const pointer = /^gitdir:\s*(.+?)\s*$/mu.exec(await readFile(link, 'utf8'))?.[1];
  if (!pointer) throw mismatch('Workspace Git link is corrupt.');
  let adminDir: string;
  try {
    adminDir = await realpath(isAbsolute(pointer) ? pointer : resolve(root, pointer));
  } catch {
    throw mismatch('Workspace Git administrative directory is missing.');
  }
  if (!same(dirname(adminDir), join(commonDir, 'worktrees'))) {
    throw mismatch('Workspace belongs to a different Git repository.');
  }
  let back: string;
  try {
    back = (await readFile(join(adminDir, 'gitdir'), 'utf8')).trim();
  } catch {
    throw mismatch('Workspace Git administrative directory has no back-link.');
  }
  let backTarget: string;
  try {
    backTarget = await realpath(isAbsolute(back) ? back : resolve(adminDir, back));
  } catch {
    throw mismatch('Workspace Git back-link target is missing.');
  }
  if (!same(backTarget, await realpath(link))) {
    throw mismatch('Workspace Git back-link points to a different checkout.');
  }
}

function same(left: string, right: string): boolean {
  return pathKey(resolve(left)) === pathKey(resolve(right));
}

function mismatch(message: string): WorkspaceRegistryError {
  return new WorkspaceRegistryError('REGISTRY_WORKSPACE_MISMATCH', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
