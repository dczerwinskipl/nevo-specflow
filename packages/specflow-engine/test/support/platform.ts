import { spawnSync } from 'node:child_process';
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The one place that decides where a platform-dependent test runs.
 *
 * Tests gate with these constants (`it.skipIf(!onLinux)`, `describe.skipIf(!onPosix)`) and never
 * read `process.platform` themselves, so the matrix in `docs/engineering/repository/ci.md` stays
 * true. The capability probes run once at import (collection time) and only report what this
 * process can really do (Windows without Developer Mode cannot create symbolic links).
 *
 * - `onLinux`: the test needs `/proc`, mount namespaces or the SIGKILL contract of the CI Linux
 *   image. Everything that kills a process on purpose belongs here: macOS runs the same suite on
 *   `main` but has neither `/proc` nor a reliable liveness proof.
 * - `onPosix`: the test needs process groups, signals, mode bits or `O_NOFOLLOW`.
 * - `hardLinksAvailable`, `symlinksAvailable`: the filesystem under the temporary directory
 *   accepted the link.
 * - `realGitAvailable`: a `git` executable answers `--version`.
 */
export function isLinux(platform: NodeJS.Platform): boolean {
  return platform === 'linux';
}

export function isPosix(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
}

export function isWindows(platform: NodeJS.Platform): boolean {
  return platform === 'win32';
}

export const onLinux: boolean = isLinux(process.platform);
export const onPosix: boolean = isPosix(process.platform);
export const onWindows: boolean = isWindows(process.platform);

/** Run `attempt` inside a scratch directory; a throw means the capability is missing. */
export function probeInScratchDirectory(attempt: (directory: string) => void): boolean {
  let directory: string | undefined;
  try {
    directory = mkdtempSync(join(tmpdir(), 'specflow-capability-probe-'));
    attempt(directory);
    return true;
  } catch {
    return false;
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

export function probeHardLinks(): boolean {
  return probeInScratchDirectory((directory) => {
    writeFileSync(join(directory, 'a'), 'x');
    linkSync(join(directory, 'a'), join(directory, 'b'));
  });
}

export function probeSymlinks(): boolean {
  return probeInScratchDirectory((directory) => {
    writeFileSync(join(directory, 'target'), 'x');
    symlinkSync(join(directory, 'target'), join(directory, 'link'), 'file');
  });
}

export function probeRealGit(
  run: (command: string, args: readonly string[]) => { status: number | null } = (command, args) =>
    spawnSync(command, [...args], { stdio: 'ignore', windowsHide: true }),
): boolean {
  try {
    return run('git', ['--version']).status === 0;
  } catch {
    return false;
  }
}

export const hardLinksAvailable: boolean = probeHardLinks();
export const symlinksAvailable: boolean = probeSymlinks();
export const realGitAvailable: boolean = probeRealGit();

/**
 * Budget of one test that creates repositories or runs many Git processes. A Windows runner needs
 * about ten times what Linux does and the Windows shards pass `--testTimeout=20000`; a test that
 * takes seconds on Linux declares this sets it with `vi.setConfig({ testTimeout })`.
 */
export const SLOW_GIT_TEST_TIMEOUT_MS = 240_000;
