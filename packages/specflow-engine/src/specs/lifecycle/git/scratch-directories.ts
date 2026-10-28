import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { CloseOperationError } from '../model';

/**
 * The Engine-owned directories below Project Home state that integration Git work uses: the scratch
 * checkouts and the empty hooks directory every mutating Engine commit runs with. Kept apart from the
 * scratch lifecycle so that the commit adapter can reach the hooks directory without importing the
 * rest of the lifecycle.
 */
function recovery(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

export async function createRealDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
  }
  await requireDirectory(path);
}

export async function requireDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) {
    throw recovery('Engine scratch directory has been redirected or replaced.');
  }
}

export async function scratchDirectories(engine: SpecFlowEngine): Promise<{
  readonly root: string;
  readonly hooks: string;
}> {
  const state = engine.context.project.stateRoot;
  const engineRoot = join(state, 'engine');
  const root = join(engineRoot, 'integration-scratch');
  const hooks = join(engineRoot, 'integration-hooks-disabled');
  // Do not recursively traverse an unverified symlinked parent.
  await requireDirectory(state);
  for (const path of [engineRoot, root, hooks]) {
    await createRealDirectory(path);
  }
  if ((await readdir(hooks)).length !== 0) {
    throw recovery('Disabled-hook directory contains unexpected files.');
  }
  return { root, hooks };
}

/** Verified, empty Engine-owned hooks directory for all mutating integration Git operations. */
export async function disabledIntegrationHooksDirectory(engine: SpecFlowEngine): Promise<string> {
  return (await scratchDirectories(engine)).hooks;
}
