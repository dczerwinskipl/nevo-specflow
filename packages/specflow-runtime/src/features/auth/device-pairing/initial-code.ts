import { execFile } from 'node:child_process';
import { open, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const INITIAL_CODE_FILE = 'initial-pairing-code';

/** Restricts an existing, still empty file to the current OS user (Windows: its ACL). */
export type RestrictToOwner = (path: string) => Promise<void>;

/** Runs a system tool and answers its standard output. */
export type RunTool = (
  file: string,
  args: readonly string[],
  options: { readonly windowsHide: true },
) => Promise<{ readonly stdout: string }>;

const runTool: RunTool = promisify(execFile);

/**
 * Windows has no file mode: the file's ACL is replaced by one entry granting the current user full
 * control (inheritance removed), with the system tools so no native dependency is needed.
 */
export function createWindowsOwnerRestriction(
  run: RunTool = runTool,
  systemRoot: string = process.env.SystemRoot ?? 'C:\\Windows',
): RestrictToOwner {
  return async (path) => {
    // By absolute path: a `whoami` earlier on PATH (Git for Windows ships one) is not the system tool.
    const system32 = join(systemRoot, 'System32');
    const { stdout } = await run(join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
    });
    const sid = /"(S-1-[0-9-]+)"/.exec(stdout)?.[1];
    if (!sid) {
      throw new Error('The current Windows user SID could not be read.');
    }

    await run(join(system32, 'icacls.exe'), [path, '/inheritance:r', '/grant:r', `*${sid}:F`], {
      windowsHide: true,
    });
  };
}

export const restrictToWindowsOwner: RestrictToOwner = createWindowsOwnerRestriction();

/**
 * Writes the initial pairing code to an owner-only file: created empty (`0600`), restricted on
 * Windows, and only then given its content, so the code never exists under a wider permission.
 * The code is never logged.
 */
export async function writeInitialCodeFile(
  path: string,
  content: string,
  options: { readonly platform?: NodeJS.Platform; readonly restrict?: RestrictToOwner } = {},
): Promise<void> {
  await rm(path, { force: true });
  const handle = await open(path, 'wx', 0o600);
  await handle.close();
  try {
    if ((options.platform ?? process.platform) === 'win32') {
      await (options.restrict ?? restrictToWindowsOwner)(path);
    }

    await writeFile(path, content, { flag: 'r+' });
  } catch (error) {
    await rm(path, { force: true });

    throw error;
  }
}

export async function removeInitialCodeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
