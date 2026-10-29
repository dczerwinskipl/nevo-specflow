// Root ESLint config — covers ONLY the files that belong to no workspace package: this config,
// `eslint.base.mjs`, and the repository scripts under `tools/` (build-package.mjs, ci-*.mjs,
// tools/eslint). It is plain JS/ESM, so it needs no tsconfig.
//
// Every workspace package (packages/*, tools/*, examples/*) is linted by its own
// `eslint.config.mjs` through its `lint` script (run by `turbo run lint`). Run the root lint with
// `pnpm lint:root` (`eslint -c eslint.config.mjs .`, which forces this config for every file);
// directories that carry their own config are excluded below. `tools/eslint/check-coverage.mjs`
// proves that every tracked source file is covered by exactly one config.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { packageConfig } from './eslint.base.mjs';

const workspaceRoots = ['packages', 'tools', 'examples', 'apps'];
const packageDirs = workspaceRoots.flatMap((group) => {
  const groupDir = path.join(import.meta.dirname, group);
  if (!existsSync(groupDir)) {
    return [];
  }

  return readdirSync(groupDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(path.join(groupDir, entry.name, 'eslint.config.mjs')),
    )
    .map((entry) => `${group}/${entry.name}/**`);
});

export default packageConfig({
  tsconfigRootDir: import.meta.dirname,
  typed: false,
  node: true,
  extraIgnores: [
    ...packageDirs,
    // Product packages and examples are linted per package even before they carry a config, so a
    // package that forgot its config fails the coverage check instead of silently dropping out.
    'packages/**',
    'examples/**',
    'apps/**',
    'docs/**/*.generated.*',
    '.local/**',
    '.artifacts/**',
    '.claude/worktrees/**',
    'work/**',
  ],
});
