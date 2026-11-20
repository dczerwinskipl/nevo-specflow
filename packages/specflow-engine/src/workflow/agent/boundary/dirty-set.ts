import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../../hash';
import type { AgentDirtyPath } from '../journal/model';
import { AGENT_DIRTY_PATH_LENGTH_MAX, AGENT_DIRTY_PATHS_MAX } from '../journal/model';

/** What a checkout has uncommitted, as the finalize section records it (`AgentDirtySet`). */
export interface DirtySetFacts {
  readonly paths: readonly AgentDirtyPath[];
  readonly truncated: boolean;
}

/**
 * The content hash of one checkout path: sha256 of a regular file's bytes, of a symbolic link's
 * target, `null` when the path is gone or is anything else (a directory of a nested repository).
 */
async function contentHash(root: string, path: string): Promise<string | null> {
  const absolute = join(root, ...path.split('/'));
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      return sha256Hex('symlink:' + (await readlink(absolute)));
    }

    return stat.isFile() ? sha256Hex(await readFile(absolute)) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * The dirty set of a checkout from the paths its status reports (staged, modified, removed or
 * untracked): each path once, sorted, with its content hash now. At most
 * {@link AGENT_DIRTY_PATHS_MAX} paths of at most {@link AGENT_DIRTY_PATH_LENGTH_MAX} characters are
 * named; anything beyond is `truncated`. Data only: the check between Turns is the boundary's own.
 */
export async function dirtySetOf(
  root: string,
  reported: readonly string[],
): Promise<DirtySetFacts> {
  const unique = [...new Set(reported.filter((path) => path !== ''))].sort();
  const named = unique.filter((path) => path.length <= AGENT_DIRTY_PATH_LENGTH_MAX);
  const kept = named.slice(0, AGENT_DIRTY_PATHS_MAX);
  const paths: AgentDirtyPath[] = [];
  for (const path of kept) {
    paths.push({ path, sha256: await contentHash(root, path) });
  }

  return { paths, truncated: kept.length < unique.length };
}
