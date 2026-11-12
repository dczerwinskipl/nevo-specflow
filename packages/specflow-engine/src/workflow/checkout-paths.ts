import { glob, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

import { isAbsent } from '../specs/document-rules/errno';

const GLOB_CHARACTERS = /[*?[\]{}]/u;

/**
 * Whether a `path` context reference resolves in a checkout: a plain path names an existing file or
 * folder; a glob matches at least one file. The path is repository-relative and already checked
 * (`contextPathProblem`: no absolute path, no `..` segment); a glob match outside the checkout (a
 * brace expanding to `..`) does not count, and `.git` is never searched. Links are not followed.
 */
export async function checkoutPathExists(root: string, path: string): Promise<boolean> {
  if (!GLOB_CHARACTERS.test(path)) {
    try {
      await lstat(join(root, ...path.split('/')));

      return true;
    } catch (error) {
      if (isAbsent(error)) {
        return false;
      }

      throw error;
    }
  }

  for await (const entry of glob(path, {
    cwd: root,
    withFileTypes: true,
    exclude: (candidate) => candidate.name === '.git',
  })) {
    const inside = relative(root, join(entry.parentPath, entry.name));
    if (entry.isFile() && inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) {
      return true;
    }
  }

  return false;
}
