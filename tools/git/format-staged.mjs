#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..', '..');

const eslintBin = path.join(
  path.dirname(require.resolve('eslint/package.json')),
  'bin',
  'eslint.js',
);

const prettierBin = path.join(
  path.dirname(require.resolve('prettier/package.json')),
  'bin',
  'prettier.cjs',
);

// Get all files staged for commit (Added, Copied, Modified, Renamed).
const stagedRaw = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
  cwd: root,
  encoding: 'utf8',
});

const stagedFiles = stagedRaw
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => existsSync(path.join(root, file)));

if (stagedFiles.length === 0) {
  process.exit(0);
}

const jsTsPattern = /\.(?:[cm]?[jt]sx?)$/;
const prettierPattern = /\.(?:[cm]?[jt]sx?|json|md|mdx|ya?ml|css|html)$/;

// Exclude generated artifacts.
const prettierFiles = stagedFiles.filter(
  (file) => prettierPattern.test(file) && !file.includes('.generated.'),
);

const lintFiles = stagedFiles.filter(
  (file) => jsTsPattern.test(file) && !file.includes('.generated.'),
);

function ownerOf(file) {
  let dir = path.dirname(file).split(path.sep).join('/');
  for (;;) {
    if (dir === '.' || dir === '') {
      return '.';
    }

    if (existsSync(path.join(root, dir, 'eslint.config.mjs'))) {
      return dir;
    }

    dir = path.posix.dirname(dir);
  }
}

if (lintFiles.length > 0) {
  const byOwner = new Map();
  for (const file of lintFiles) {
    const owner = ownerOf(file);
    const rel =
      owner === '.'
        ? file
        : path.relative(path.join(root, owner), path.join(root, file)).split(path.sep).join('/');
    if (!byOwner.has(owner)) {
      byOwner.set(owner, []);
    }

    byOwner.get(owner).push(rel);
  }

  for (const [owner, files] of byOwner) {
    try {
      const cwd = owner === '.' ? root : path.join(root, owner);
      const args =
        owner === '.'
          ? [eslintBin, '-c', 'eslint.config.mjs', '--fix', ...files]
          : [eslintBin, '--fix', ...files];
      execFileSync(process.execPath, args, { cwd, stdio: 'inherit' });
    } catch (error) {
      console.error(`ESLint autofix failed in ${owner}.`);
      process.exit(error.status ?? 1);
    }
  }
}

if (prettierFiles.length > 0) {
  try {
    execFileSync(process.execPath, [prettierBin, '--write', ...prettierFiles], {
      cwd: root,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Prettier formatting failed on staged files.');
    process.exit(error.status ?? 1);
  }
}

// Re-stage the formatted files.
const reAddFiles = Array.from(new Set([...lintFiles, ...prettierFiles]));
if (reAddFiles.length > 0) {
  execFileSync('git', ['add', '--', ...reAddFiles], { cwd: root });
}
