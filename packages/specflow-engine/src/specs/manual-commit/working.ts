import { join } from 'node:path';

import { hashWorkingFile } from '../document-rules/working-file';
import { RAW_CONTENT_MAX_BYTES } from '../document-rules/limits';
import type { WorkingContent } from './selection';

/**
 * The sha256 of the regular file at `path` below `root`: `null` when it does not exist, `undefined` for
 * anything else (also a file over the raw content limit). A symbolic link is anything else: reading through it would hash content that is not
 * the path's own, and Git would commit the link.
 */
export async function readWorkingContent(root: string, path: string): Promise<WorkingContent> {
  const found = await hashWorkingFile(join(root, path), RAW_CONTENT_MAX_BYTES);
  if (found.kind === 'absent') {
    return null;
  }

  return found.kind === 'file' ? found.sha256 : undefined;
}

/** What the working tree holds for each of `paths`, read one after the other. */
export async function readWorkingContents(
  root: string,
  paths: readonly string[],
): Promise<Map<string, WorkingContent>> {
  const found = new Map<string, WorkingContent>();
  for (const path of paths) {
    found.set(path, await readWorkingContent(root, path));
  }

  return found;
}
