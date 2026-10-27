import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../hash';
import type { WorkingContent } from './selection';

/**
 * The sha256 of the regular file at `path` below `root`: `null` when it does not exist, `undefined` for
 * anything else. A symbolic link is anything else: reading through it would hash content that is not
 * the path's own, and Git would commit the link.
 */
export async function readWorkingContent(root: string, path: string): Promise<WorkingContent> {
  try {
    const target = join(root, path);
    if (!(await lstat(target)).isFile()) return undefined;
    return sha256Hex(await readFile(target));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    return undefined;
  }
}

/** What the working tree holds for each of `paths`, read one after the other. */
export async function readWorkingContents(
  root: string,
  paths: readonly string[],
): Promise<Map<string, WorkingContent>> {
  const found = new Map<string, WorkingContent>();
  for (const path of paths) found.set(path, await readWorkingContent(root, path));
  return found;
}
