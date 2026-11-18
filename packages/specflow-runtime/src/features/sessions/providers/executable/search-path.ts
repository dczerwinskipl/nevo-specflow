import { tmpdir } from 'node:os';
import { win32 } from 'node:path';
import type { ProviderEnvironment } from '../process';

/** Whether `target` is `root` or inside it (Windows paths compare case-insensitively). */
export function insideDirectory(root: string, target: string): boolean {
  const path = win32.relative(root, target);

  return path === '' || (path !== '..' && !path.startsWith('..\\') && !win32.isAbsolute(path));
}

/**
 * The folders nothing is ever run from: the project workspace (repository content must never
 * choose the executable) and the temporary folders (anything may write there).
 */
export function untrustedRoots(
  environment: ProviderEnvironment,
  workspace: string,
  temporaryRoots: readonly (string | undefined)[] = [
    environment.values.TEMP,
    environment.values.TMP,
    tmpdir(),
  ],
): string[] {
  return [workspace, ...temporaryRoots].filter(
    (root): root is string => typeof root === 'string' && win32.isAbsolute(root),
  );
}

/** Whether discovery may run an executable from `path`: absolute, local and in no untrusted root. */
export function trustedPath(path: string, untrusted: readonly string[]): boolean {
  return (
    win32.isAbsolute(path) &&
    !/^[\\/]{2}/.test(path) &&
    !untrusted.some((root) => insideDirectory(root, path))
  );
}

/**
 * The directories of the projected PATH that discovery may run a command from, in PATH order:
 * absolute local entries only, none in an untrusted root. A relative entry (such as `.`) would
 * resolve inside the project.
 */
export function searchPath(
  environment: ProviderEnvironment,
  untrusted: readonly string[],
): string[] {
  const seen = new Set<string>();
  const directories: string[] = [];
  for (const raw of (environment.values.PATH ?? '').split(';')) {
    const entry = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!entry || entry.includes('\0') || !trustedPath(entry, untrusted)) {
      continue;
    }

    const directory = win32.resolve(entry);
    const key = directory.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      directories.push(directory);
    }
  }

  return directories;
}
