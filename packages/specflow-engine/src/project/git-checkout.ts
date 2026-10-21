import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { executeGit } from '../git/process';

// This is a checkout-local bootstrap layout, NOT the canonical Project Home.
// Linked Git worktrees intentionally return different roots until the T03 resolver lands.
export const PROJECT_CONFIG_RELATIVE_PATH = '.nevo/config.yaml';
export const LOCAL_CONFIG_RELATIVE_PATH = '.nevo/local/config.yaml';
export const LOCAL_IGNORE_ENTRY = '.nevo/local/';

export interface GitCheckoutLayout {
  readonly root: string;
  readonly projectConfigPath: string;
  readonly localConfigPath: string;
}

export async function resolveGitCheckoutLayout(cwd: string): Promise<GitCheckoutLayout> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (result.code !== 0) {
    throw new Error(
      `Nevo SpecFlow must be run inside a Git repository: ${result.stderr.trim() || 'git rev-parse failed'}`,
    );
  }

  const root = await realpath(resolve(result.stdout.trim()));
  return {
    root,
    projectConfigPath: join(root, PROJECT_CONFIG_RELATIVE_PATH),
    localConfigPath: join(root, LOCAL_CONFIG_RELATIVE_PATH),
  };
}

export async function isGitIgnored(root: string, relativePath: string): Promise<boolean> {
  const result = await runGit(root, ['check-ignore', '-q', '--', relativePath]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(
    `Unable to verify Git ignore rules for ${relativePath}: ${result.stderr.trim() || `git check-ignore exited ${String(result.code)}`}`,
  );
}

/**
 * Batched equivalent of {@link isGitIgnored}: one `git check-ignore` process for
 * every path. Non-quiet output lists exactly the ignored pathspecs, so a path
 * re-exposed by a negation rule is reported as not ignored. Returns the same
 * boolean per input path, in input order; exit >1 fails like the single form.
 */
export async function areGitIgnored(
  root: string,
  relativePaths: readonly string[],
): Promise<boolean[]> {
  if (relativePaths.length === 0) return [];
  // Git C-quotes unusual path characters in line output; delegate those to the
  // single form so matching stays exact (Engine-owned paths never need this).
  if (relativePaths.some((path) => !/^[A-Za-z0-9_./ -]+$/u.test(path))) {
    return Promise.all(relativePaths.map((path) => isGitIgnored(root, path)));
  }
  const result = await runGit(root, ['check-ignore', '--', ...relativePaths]);
  if (result.code !== 0 && result.code !== 1) {
    throw new Error(
      `Unable to verify Git ignore rules for ${relativePaths.join(', ')}: ${result.stderr.trim() || `git check-ignore exited ${String(result.code)}`}`,
    );
  }
  const ignored = new Set(result.stdout.split(/\r?\n/u).filter((entry) => entry.length > 0));
  return relativePaths.map((path) => ignored.has(path));
}

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Bootstrap and discovery are read-only callers of the bounded Git adapter. */
export async function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  const result = await executeGit(cwd, args);
  return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}
