// Fresh-clone acceptance for the package-owned artifact builder.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { run } from '../../packaging/exec';
import { createPackagingWorkspace } from './workspace.test-support';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const productDependencies = ['authorization', 'specflow-contracts', 'specflow-runtime'] as const;

const pinnedPnpm = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { packageManager: string }
).packageManager.replace(/^pnpm@/, '');

describe('pnpm product:pack — self-bootstrapping from a fresh install', () => {
  it('uses the repository-pinned pnpm', () => {
    const version = run('pnpm', ['--version'], { cwd: repoRoot });
    expect(version).toBe(pinnedPnpm);
    expect(pinnedPnpm.startsWith('10.')).toBe(true);
  });

  it('produces a tarball from an independently installed workspace without generated outputs', () => {
    const workspace = createPackagingWorkspace(repoRoot);
    try {
      const artifacts = join(workspace.root, '.artifacts');
      for (const name of productDependencies) {
        expect(existsSync(join(workspace.root, 'packages', name, 'dist'))).toBe(false);
        expect(existsSync(join(workspace.root, 'packages', name, '.tsbuild'))).toBe(false);
      }

      expect(existsSync(artifacts)).toBe(false);

      run('pnpm', ['product:pack'], { cwd: workspace.root, timeout: 180_000 });

      for (const name of productDependencies) {
        expect(existsSync(join(workspace.root, 'packages', name, 'dist'))).toBe(true);
      }

      expect(readdirSync(artifacts).filter((file) => file.endsWith('.tgz')).length).toBeGreaterThan(
        0,
      );
    } finally {
      workspace.dispose();
    }
  }, 400_000);
});
