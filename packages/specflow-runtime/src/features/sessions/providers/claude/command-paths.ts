import { realpath } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

import type { AllowlistedCliPaths } from '@nevo/specflow-contracts/documents';

/**
 * Whether the paths an allowlisted product CLI command touches stay inside the Turn's worktree (D20):
 * the folder of its leading `cd` (relative to the worktree, where Claude's shell starts each command)
 * and each redirection target (relative to that folder). Judged twice and fail-closed: as written
 * (lexically, case-insensitive on Windows) and as canonical real paths, with the deepest existing
 * ancestor resolved, so a link or junction inside the worktree that points out of it is caught. On
 * Windows a Git Bash drive path (`/c/work`) is read as `C:\work`; any other root-relative path
 * (`/tmp`) is refused, since Git Bash maps it somewhere outside the worktree.
 */
export async function commandPathsInsideWorkspace(
  paths: AllowlistedCliPaths,
  workspace: string,
  platform: NodeJS.Platform,
  files: { realpath(path: string): Promise<string> } = { realpath },
): Promise<boolean> {
  if (paths.cd === undefined && paths.redirections.length === 0) {
    return true;
  }

  const windows = platform === 'win32';
  const flavour = windows ? win32 : posix;
  const fold = (path: string) => (windows ? path.toLowerCase() : path);
  const native = (path: string): string | undefined => {
    if (!windows) {
      return path;
    }

    const drive = /^\/([a-zA-Z])(?=\/|$)(.*)$/.exec(path);
    if (drive) {
      const rest = drive[2] ?? '';

      return `${drive[1]!.toUpperCase()}:${rest === '' ? '\\' : rest}`;
    }

    // `/x` (not a drive) and `\x` are relative to the current drive's root, outside the worktree.
    return /^[/\\](?![/\\])/.test(path) ? undefined : path;
  };

  const root = flavour.resolve(workspace);
  let realRoot: string;
  try {
    realRoot = flavour.resolve(await files.realpath(root));
  } catch {
    return false;
  }

  const within = (base: string, path: string) => {
    const relative = flavour.relative(fold(base), fold(path));

    return relative === '' || (!relative.startsWith('..') && !flavour.isAbsolute(relative));
  };

  /** The canonical path of `path`: its deepest existing ancestor resolved, the rest appended. */
  const canonical = async (path: string): Promise<string | undefined> => {
    let existing = path;
    const rest: string[] = [];
    for (;;) {
      try {
        return flavour.join(await files.realpath(existing), ...rest);
      } catch {
        const parent = flavour.dirname(existing);
        if (parent === existing) {
          return undefined;
        }

        rest.unshift(flavour.basename(existing));
        existing = parent;
      }
    }
  };

  const inside = async (path: string) =>
    within(root, path) && (await canonical(path).then((real) => !!real && within(realRoot, real)));

  let cwd = root;
  if (paths.cd !== undefined) {
    const target = native(paths.cd);
    if (target === undefined) {
      return false;
    }

    cwd = flavour.resolve(root, target);
    if (!(await inside(cwd))) {
      return false;
    }
  }

  for (const redirection of paths.redirections) {
    const target = native(redirection);
    if (target === undefined || !(await inside(flavour.resolve(cwd, target)))) {
      return false;
    }
  }

  return true;
}
