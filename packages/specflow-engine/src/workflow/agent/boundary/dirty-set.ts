import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readlink } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../../hash';
import {
  AGENT_DIRTY_FILE_BYTES_MAX,
  AGENT_DIRTY_PATH_LENGTH_MAX,
  AGENT_DIRTY_PATHS_MAX,
  type AgentDirtyPath,
} from '../journal/model';

/** What a checkout has uncommitted, as the finalize section records it (`AgentDirtySet`). */
export interface DirtySetFacts {
  readonly paths: readonly AgentDirtyPath[];
  readonly truncated: boolean;
}

/** The sha256 of a file's bytes, read as a stream (no whole-file buffer). */
async function streamedHash(absolute: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute)) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}

/**
 * One checkout path of a dirty set: sha256 of a regular file's bytes (streamed; a file above
 * {@link AGENT_DIRTY_FILE_BYTES_MAX} is `oversize` and not hashed), of a symbolic link's target,
 * `null` when the path is gone or is anything else (a directory of a nested repository).
 */
async function dirtyPath(root: string, path: string): Promise<AgentDirtyPath> {
  const absolute = join(root, ...path.split('/'));
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      return { path, sha256: sha256Hex('symlink:' + (await readlink(absolute))) };
    }

    if (!stat.isFile()) {
      return { path, sha256: null };
    }

    if (stat.size > AGENT_DIRTY_FILE_BYTES_MAX) {
      return { path, sha256: null, oversize: true };
    }

    return { path, sha256: await streamedHash(absolute) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path, sha256: null };
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
    paths.push(await dirtyPath(root, path));
  }

  return { paths, truncated: kept.length < unique.length };
}
