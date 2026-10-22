import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveGitExecutable } from '../../src/git/executable';

const gitExecutable = resolveGitExecutable();

/** Real Git, real filesystem and a committed baseline for integration tests. */
export function git(root: string, ...args: string[]): string {
  return execFileSync(gitExecutable, args, { cwd: root, encoding: 'utf8' }).trim();
}

export async function createGitTestProject(prefix: string, configYaml: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  git(root, 'init', '-q');
  // Fixtures are standalone repositories and do not inherit the root .gitattributes.
  // Keep checkout bytes stable across Windows, macOS and Linux, regardless of
  // the Git for Windows runner's global core.autocrlf setting.
  git(root, 'config', '--local', 'core.autocrlf', 'false');
  await mkdir(join(root, '.nevo'), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), configYaml);
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  return root;
}

/**
 * Commit whatever is staged with the standard test identity; no-op when nothing is staged.
 * Specification Create commits its own scaffold when Git is enabled, so a by-hand commit
 * after Create must tolerate "nothing to commit" while still working for Git-disabled projects.
 * Returns true when a commit was made.
 */
export function commitStaged(root: string, message: string): boolean {
  if (git(root, 'diff', '--cached', '--name-only') === '') return false;
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    message,
  );
  return true;
}
