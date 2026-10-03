// Fresh-clone acceptance for the package-owned artifact builder.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const sh = process.platform === 'win32';
const artifacts = join(repoRoot, '.artifacts');
const productDependencies = [
  join(repoRoot, 'packages', 'authorization'),
  join(repoRoot, 'packages', 'specflow-contracts'),
  join(repoRoot, 'packages', 'specflow-runtime'),
] as const;

const pinnedPnpm = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { packageManager: string }
).packageManager.replace(/^pnpm@/, '');

describe('pnpm product:pack — self-bootstrapping from a fresh install', () => {
  it('uses the repository-pinned pnpm', () => {
    const version = execFileSync('pnpm', ['--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: sh,
    }).trim();
    expect(version).toBe(pinnedPnpm);
    expect(pinnedPnpm.startsWith('10.')).toBe(true);
  });

  it('produces a tarball after generated dependency outputs and artifacts are cleared', () => {
    const remove = (path: string): void =>
      rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });

    for (const packageDir of productDependencies) {
      remove(join(packageDir, 'dist'));
      remove(join(packageDir, '.tsbuild'));
    }
    mkdirSync(artifacts, { recursive: true });
    for (const artifact of readdirSync(artifacts)) remove(join(artifacts, artifact));

    for (const packageDir of productDependencies) {
      expect(existsSync(join(packageDir, 'dist'))).toBe(false);
    }
    expect(readdirSync(artifacts)).toEqual([]);

    execFileSync('pnpm', ['product:pack'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: sh,
      timeout: 180_000,
    });

    for (const packageDir of productDependencies) {
      expect(existsSync(join(packageDir, 'dist'))).toBe(true);
    }
    expect(readdirSync(artifacts).filter((file) => file.endsWith('.tgz')).length).toBeGreaterThan(0);
  }, 200_000);
});
