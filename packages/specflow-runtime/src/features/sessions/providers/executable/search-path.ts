import { win32 } from 'node:path';
import type { ProviderEnvironment } from '../process';

/** Whether `target` is `root` or inside it (Windows paths compare case-insensitively). */
export function insideDirectory(root: string, target: string): boolean {
  const path = win32.relative(root, target);

  return path === '' || (path !== '..' && !path.startsWith('..\\') && !win32.isAbsolute(path));
}

/**
 * The directories of the projected PATH that discovery may run a command from, in PATH order:
 * absolute entries only, none inside the project workspace. A relative entry (such as `.`) or a
 * folder of the checked-out repository would let repository content choose the executable.
 */
export function searchPath(environment: ProviderEnvironment, workspace: string): string[] {
  const seen = new Set<string>();
  const directories: string[] = [];
  for (const raw of (environment.values.PATH ?? '').split(';')) {
    const entry = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!entry || entry.includes('\0') || !win32.isAbsolute(entry) || /^[\\/]{2}/.test(entry)) {
      continue;
    }

    const directory = win32.resolve(entry);
    const key = directory.toLowerCase();
    if (seen.has(key) || insideDirectory(workspace, directory)) {
      continue;
    }

    seen.add(key);
    directories.push(directory);
  }

  return directories;
}
