import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

/**
 * Git for Windows puts a forwarding git.exe in its cmd/bin directories.
 * Resolve the real Git binary alongside the FIRST Git found on PATH so that
 * process startup does not require an extra wrapper process.
 *
 * Do not modify PATH or use an unrelated Git installation. Non-Windows,
 * portable distributions and unknown layouts retain the previous behavior.
 */
export function resolveGitExecutable(
  platform: NodeJS.Platform = process.platform,
  pathValue: string = process.env.PATH ?? '',
  existsFile: (path: string) => boolean = existsSync,
): string {
  if (platform !== 'win32') {
    return 'git';
  }

  for (const rawDirectory of pathValue.split(';')) {
    const directory = rawDirectory.trim().replace(/^"|"$/gu, '');
    if (!directory) {
      continue;
    }

    if (!existsFile(win32.join(directory, 'git.exe'))) {
      continue;
    }

    const kind = win32.basename(directory).toLowerCase();
    if (kind !== 'cmd' && kind !== 'bin') {
      return 'git';
    }

    const installation = win32.dirname(directory);
    for (const runtime of ['ucrt64', 'mingw64']) {
      const executable = win32.join(installation, runtime, 'bin', 'git.exe');
      if (existsFile(executable)) {
        return executable;
      }
    }

    return 'git';
  }

  return 'git';
}
