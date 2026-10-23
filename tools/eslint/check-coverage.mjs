// Proves that lint covers every tracked source file exactly once.
//
// Linting is split per workspace package, so a package that forgets its `eslint.config.mjs` or
// `lint` script, or a root config that starts to swallow package files, would silently drop code
// out of the gate. This script (run as part of `pnpm lint:root`) asserts, for every git-tracked
// JS/TS source file, that
//   - it is linted by its owning config: the nearest `eslint.config.mjs` (its package's, or the
//     root's for files that belong to no package),
//   - that config matches it (not ignored, a config block applies), and
//   - the root lint does NOT also lint it unless the root owns it.
// It also asserts that every workspace package has an `eslint.config.mjs` and a `lint` script.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(path.join(root, 'package.json'));
const { ESLint } = require('eslint');

const sourcePattern = /\.(?:[cm]?[jt]sx?)$/;
const configName = 'eslint.config.mjs';
const problems = [];
const fail = (message) => problems.push(message);

// Workspace package directories from pnpm-workspace.yaml (`packages:` globs of the form `dir/*`).
function workspacePackageDirs() {
  const yaml = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const section = /^packages:\s*\n((?:\s+-\s+.*\n|\s*#.*\n)+)/m.exec(yaml)?.[1] ?? '';
  const globs = [...section.matchAll(/^\s+-\s+["']?([^"'\s#]+)["']?/gm)].map((match) => match[1]);
  const dirs = [];
  for (const glob of globs) {
    if (!glob.endsWith('/*')) throw new Error(`Unsupported workspace glob: ${glob}`);
    const group = glob.slice(0, -2);
    const tracked = execFileSync('git', ['ls-files', `${group}/*/package.json`], {
      cwd: root,
      encoding: 'utf8',
    });
    for (const file of tracked.split('\n').filter(Boolean)) dirs.push(path.posix.dirname(file));
  }
  return dirs.sort();
}

const packageDirs = workspacePackageDirs();
for (const dir of packageDirs) {
  if (!existsSync(path.join(root, dir, configName))) fail(`${dir}: missing ${configName}`);
  const { scripts = {} } = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
  if (!/^eslint\b/.test(scripts.lint ?? '')) fail(`${dir}: missing "lint" script running eslint`);
}

function ownerOf(file) {
  let dir = path.posix.dirname(file);
  for (;;) {
    if (dir === '.' || dir === '') return '.';
    if (existsSync(path.join(root, dir, configName))) return dir;
    dir = path.posix.dirname(dir);
  }
}

const instances = new Map();
function eslintFor(ownerDir) {
  if (!instances.has(ownerDir)) {
    // A package lint run (`eslint .` inside the package) or the root run (`-c eslint.config.mjs`).
    instances.set(
      ownerDir,
      ownerDir === '.'
        ? new ESLint({ cwd: root, overrideConfigFile: path.join(root, configName) })
        : new ESLint({ cwd: path.join(root, ownerDir) }),
    );
  }
  return instances.get(ownerDir);
}

const files = execFileSync(
  'git',
  ['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter((file) => sourcePattern.test(file) && !/\.generated\./.test(file));

const perOwner = new Map();
for (const file of files) {
  const owner = ownerOf(file);
  const packageOwner = packageDirs.find((dir) => file.startsWith(`${dir}/`));
  const expected = packageOwner ?? '.';
  perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);

  if (owner !== expected) {
    fail(`${file}: owned by ${owner}/${configName} but belongs to ${expected}`);
    continue;
  }
  const absolute = path.join(root, file);
  const ownerLint = eslintFor(owner);
  if (await ownerLint.isPathIgnored(absolute)) fail(`${file}: ignored by ${owner} config`);
  else if (!(await ownerLint.calculateConfigForFile(absolute)))
    fail(`${file}: no ${owner} config block matches it`);
  if (owner === '.' && !/\.(?:[cm]?js)$/.test(file))
    fail(`${file}: root config lints plain JS only; TypeScript belongs in a package`);
  if (owner !== '.' && !(await eslintFor('.').isPathIgnored(absolute)))
    fail(`${file}: also linted by the root config (would be linted twice)`);
}

if (problems.length > 0) {
  console.error(`Lint coverage check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const summary = [...perOwner]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([dir, n]) => `${dir}: ${n}`);
console.log(
  `Lint coverage OK: ${files.length} tracked source files, each linted by exactly one config.`,
);
console.log(summary.join('\n'));
