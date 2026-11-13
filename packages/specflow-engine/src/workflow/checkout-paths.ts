import { lstat, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { isAbsent } from '../specs/document-rules/errno';
import { WorkflowError } from './errors';
import { CONTEXT_PATH_ENTRIES_MAX } from './limits';

const GLOB_CHARACTERS = /[*?[\]{}]/u;
/** Never searched: Git's own data and installed packages (cheap stand-ins for ignore rules). */
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules']);

/**
 * Whether a `path` context reference resolves in a checkout: a plain path names an existing file or
 * folder; a glob matches at least one file or folder (the UX shows folders as code paths). The path
 * is repository-relative and already checked (`contextPathProblem`: no absolute path, no `..`
 * segment). A glob is matched by walking the checkout from its literal leading folders, without
 * following links and without entering `.git` or `node_modules` (Git ignore rules are not consulted:
 * that needs a Git process per question). The walk runs under the project control lock, so it is
 * bounded: a glob that needs more than `CONTEXT_PATH_ENTRIES_MAX` entries to decide is refused
 * (`WORKFLOW_INPUT_INVALID`) instead of holding the lock.
 */
export async function checkoutPathExists(
  root: string,
  path: string,
  limit = CONTEXT_PATH_ENTRIES_MAX,
): Promise<boolean> {
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

  const segments = path.split('/');
  const literal = segments.slice(
    0,
    segments.findIndex((segment) => GLOB_CHARACTERS.test(segment)),
  );
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

      const relative = folder === '' ? entry.name : `${folder}/${entry.name}`;
      if (posix.matchesGlob(relative, path)) {
        return true;
      }

      if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIPPED_FOLDERS.has(entry.name)) {
        pending.push(relative);
      }
    }
  }

  return false;
}
