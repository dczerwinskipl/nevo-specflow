import { realpath } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

import {
  AGENT_SCRATCH_DIRECTORY,
  type AllowlistedCliPaths,
} from '@nevo/specflow-contracts/documents';

/**
 * Whether the paths an allowlisted product CLI command touches are ones the host may approve (D20),
 * fail-closed:
 *
 * - the leading `cd` folder is absolute (the judge refuses any other) and inside the worktree;
 * - a relative path is judged only from that folder: without a leading absolute `cd` the shell's
 *   current folder is not known to the host (Claude's shell may keep an earlier `cd`), so a relative
 *   path is refused;
 * - output redirections go only into the worktree's scratch folder (`AGENT_SCRATCH_DIRECTORY`),
 *   never into `.git`, its hooks, other `.nevo` files or anything else;
 * - input redirections and `--…-file` values stay inside the worktree.
 *
 * Each path is judged as written (lexically, case-insensitive on Windows) and as a canonical real
 * path, the deepest existing ancestor resolved, so a link or junction pointing out is caught. On
 * Windows a Git Bash drive path (`/c/work`) is read as `C:\work`; any other root-relative path
 * (`/tmp`) is refused, since Git Bash maps it somewhere outside the worktree.
 */
export async function commandPathsInsideWorkspace(
  paths: AllowlistedCliPaths,
  workspace: string,
  platform: NodeJS.Platform,
  files: { realpath(path: string): Promise<string> } = { realpath },
): Promise<boolean> {
  if (paths.cd === undefined && paths.outputs.length === 0 && paths.inputs.length === 0) {
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

  const within = (base: string, path: string, strict: boolean) => {
    const relative = flavour.relative(fold(base), fold(path));

    return (
      (relative === '' ? !strict : true) &&
      !relative.startsWith('..') &&
      !flavour.isAbsolute(relative)
    );
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

  /** Inside `folder` (a folder of the worktree), as written and as a real path. */
  const inside = async (path: string, folder: string, strict: boolean) => {
    const real = await canonical(path);
    const realFolder = flavour.join(realRoot, flavour.relative(root, folder));

    return within(folder, path, strict) && !!real && within(realFolder, real, strict);
  };

  let cwd: string | undefined;
  if (paths.cd !== undefined) {
    const target = native(paths.cd);
    if (target === undefined || !flavour.isAbsolute(target)) {
      return false;
    }

    cwd = flavour.resolve(target);
    if (!(await inside(cwd, root, false))) {
      return false;
    }
  }

  /** A path the command names: absolute, or relative to the known folder of the leading `cd`. */
  const located = (path: string): string | undefined => {
    const target = native(path);
    if (target === undefined) {
      return undefined;
    }

    if (flavour.isAbsolute(target)) {
      return flavour.resolve(target);
    }

    return cwd === undefined ? undefined : flavour.resolve(cwd, target);
  };

  const scratch = flavour.join(root, ...AGENT_SCRATCH_DIRECTORY.split('/'));
  for (const output of paths.outputs) {
    const path = located(output);
    if (path === undefined || !(await inside(path, scratch, true))) {
      return false;
    }
  }

  for (const input of paths.inputs) {
    const path = located(input);
    if (path === undefined || !(await inside(path, root, true))) {
      return false;
    }
  }

  return true;
}
