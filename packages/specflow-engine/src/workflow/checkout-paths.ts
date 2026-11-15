import { readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, posix, relative } from 'node:path';

import { isAbsent } from '../specs/document-rules/errno';
import { WorkflowError } from './errors';
import { CONTEXT_PATH_ENTRIES_MAX } from './limits';

const GLOB_CHARACTERS = /[*?[\]{}]/u;
/** Never searched: Git's own data and installed packages (cheap stand-ins for ignore rules). */
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules']);

/**
 * One symlink rule for every path the check touches (plain path, a glob's literal leading folders
 * and a glob match): the path counts only when it resolves (`realpath`, so every segment and
 * symlink on the way) to an existing target inside the checkout's real root. Dangling, looping and
 * escaping symlinks are "not found".
 */
async function resolvesInside(rootReal: string, absolute: string): Promise<boolean> {
  let real: string;
  try {
    real = await realpath(absolute);
  } catch (error) {
    if (isAbsent(error) || (error as NodeJS.ErrnoException).code === 'ELOOP') {
      return false;
    }

    throw error;
  }

  const rel = relative(rootReal, real);

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Whether a `path` context reference resolves in a checkout: a plain path names an existing file or
 * folder; a glob matches at least one file or folder (the UX shows folders as code paths). The path
 * is repository-relative and already checked (`contextPathProblem`: no absolute path, no `..`
 * segment). A glob is matched by walking the checkout from its literal leading folders, without
 * descending into symlinked folders and without entering `.git` or `node_modules` (Git ignore rules are not consulted:
 * that needs a Git process per question). The walk runs under the project control lock, so it is
 * bounded: a glob that needs more than `CONTEXT_PATH_ENTRIES_MAX` entries to decide is refused
 * (`WORKFLOW_INPUT_INVALID`) instead of holding the lock.
 */
export async function checkoutPathExists(
  root: string,
  path: string,
  limit = CONTEXT_PATH_ENTRIES_MAX,
): Promise<boolean> {
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch (error) {
    if (isAbsent(error)) {
      return false;
    }

    throw error;
  }

  if (!GLOB_CHARACTERS.test(path)) {
    return resolvesInside(rootReal, join(root, ...path.split('/')));
  }

  const segments = path.split('/');
  const literal = segments.slice(
    0,
    segments.findIndex((segment) => GLOB_CHARACTERS.test(segment)),
  );
  if (literal.length > 0 && !(await resolvesInside(rootReal, join(root, ...literal)))) {
    return false;
  }

  let visited = 0;
  const pending = [literal.join('/')];
  while (pending.length > 0) {
    const folder = pending.shift() ?? '';
    let entries;
    try {
      entries = await readdir(join(root, ...(folder === '' ? [] : folder.split('/'))), {
        withFileTypes: true,
      });
    } catch (error) {
      if (isAbsent(error)) {
        continue;
      }

      throw error;
    }

    for (const entry of entries) {
      visited += 1;
      if (visited > limit) {
        throw new WorkflowError(
          'WORKFLOW_INPUT_INVALID',
          `The path check for "${path}" is too broad (more than ${String(limit)} entries); name a narrower path.`,
        );
      }

      const relativePath = folder === '' ? entry.name : `${folder}/${entry.name}`;
      if (
        posix.matchesGlob(relativePath, path) &&
        (!entry.isSymbolicLink() ||
          (await resolvesInside(rootReal, join(root, ...relativePath.split('/')))))
      ) {
        return true;
      }

      if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIPPED_FOLDERS.has(entry.name)) {
        pending.push(relativePath);
      }
    }
  }

  return false;
}
