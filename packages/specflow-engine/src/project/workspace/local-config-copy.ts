import { createHash } from 'node:crypto';
import { link, lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonAtomically } from '../fs/atomic-json';
import { removeFileWindowsSafe } from '../fs/windows-safe-fs';
import { LOCAL_CONFIG_RELATIVE_PATH } from '../git-checkout';

/**
 * Engine-owned record of the local configuration bytes Create copied into a managed worktree. It
 * lives beside the workspace identity marker in the worktree's own Git-ignored state, so it shares
 * the marker's lifetime: it survives Create recovery and disappears with the worktree.
 */
export const LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH = '.nevo/local/state/local-config-copy.json';

interface LocalConfigCopyRecord {
  readonly version: 1;
  readonly sha256: string;
}

/** Whether a worktree's local configuration is exactly the copy Create made. */
export type LocalConfigCopyState = 'absent' | 'unchanged' | 'changed' | 'unrecorded' | 'unreadable';

/**
 * Fixed, Engine-owned staging name in `.nevo/local/`, so a retry can find and remove a stage file a
 * crash left behind.
 */
const STAGED_COPY_RELATIVE_PATH = '.nevo/local/.config.yaml.create-copy.tmp';

/**
 * `.nevo/local/` is Git-ignored, so a new worktree would otherwise lack the workstation-local
 * configuration (for example `ai.embeddings`). The caller has verified the worktree's state
 * directory (identity verification).
 *
 * The record of the bytes is published BEFORE the configuration, so a configuration without a
 * record is never the Engine's. The configuration itself is staged completely and then hard-linked
 * into place, which never replaces an existing file and never exposes a truncated one. Idempotent
 * for recovery: an existing configuration (the Engine's or the user's) is never touched, and while
 * none exists a re-run rewrites the record with Project Home's current bytes and copies them.
 */
export async function copyLocalConfigIntoWorktree(home: string, worktree: string): Promise<void> {
  const staged = join(worktree, STAGED_COPY_RELATIVE_PATH);
  // A stage file left by an interrupted earlier attempt is never adopted.
  await removeFileWindowsSafe(staged);
  const target = join(worktree, LOCAL_CONFIG_RELATIVE_PATH);
  if (await exists(target)) {
    return;
  }

  const bytes = await readOptional(join(home, LOCAL_CONFIG_RELATIVE_PATH));
  if (!bytes) {
    return;
  }

  const record: LocalConfigCopyRecord = { version: 1, sha256: hash(bytes) };
  await writeJsonAtomically(join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH), record);
  const handle = await open(staged, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await link(staged, target);
  } catch (error) {
    // The user created a configuration meanwhile: it stays, and Close will refuse to delete it.
    if (!isNodeError(error, 'EEXIST')) {
      throw error;
    }
  } finally {
    await removeFileWindowsSafe(staged);
  }
}

/** Read-only comparison of a worktree's local configuration with Create's recorded copy. */
export async function inspectLocalConfigCopy(worktree: string): Promise<LocalConfigCopyState> {
  let bytes: Buffer | undefined;
  try {
    bytes = await readOptional(join(worktree, LOCAL_CONFIG_RELATIVE_PATH));
  } catch {
    return 'unreadable';
  }

  if (!bytes) {
    return 'absent';
  }

  let recorded;
  try {
    recorded = await readRecord(worktree);
  } catch {
    return 'unreadable';
  }

  if (recorded === 'corrupt') {
    return 'unreadable';
  }

  if (recorded === undefined) {
    return 'unrecorded';
  }

  return recorded.sha256 === hash(bytes) ? 'unchanged' : 'changed';
}

async function readRecord(
  worktree: string,
): Promise<LocalConfigCopyRecord | 'corrupt' | undefined> {
  const bytes = await readOptional(join(worktree, LOCAL_CONFIG_COPY_RECORD_RELATIVE_PATH));
  if (!bytes) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (
      isRecord(parsed) &&
      parsed.version === 1 &&
      typeof parsed.sha256 === 'string' &&
      /^[0-9a-f]{64}$/u.test(parsed.sha256)
    ) {
      return { version: 1, sha256: parsed.sha256 };
    }
  } catch {
    // Falls through to corrupt.
  }

  return 'corrupt';
}

/** Regular file bytes, or undefined when absent; a redirected or nonregular entry is an error. */
async function readOptional(path: string): Promise<Buffer | undefined> {
  if (!(await exists(path))) {
    return undefined;
  }

  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Local configuration path is not a regular file: ' + path);
  }

  return readFile(path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return false;
    }

    throw error;
  }
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
