import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

// Temporary CI investigation. Measures process startup separately from Git
// operations; does not modify production Engine code or persistent Git config.
const samples = new Map();
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' };
function measure(name, fn) {
  const started = performance.now();
  const result = fn();
  const elapsed = performance.now() - started;
  const values = samples.get(name) ?? [];
  values.push(elapsed);
  samples.set(name, values);
  return result;
}
function command(executable, args, cwd) {
  return execFileSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  }).trim();
}
function git(args, cwd, category) {
  return measure(category, () => command('git', args, cwd));
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
const describe = (a) => {
  const sorted = [...a].sort((x, y) => x - y);
  return {
    n: a.length,
    medianMs: +q(sorted, 0.5).toFixed(1),
    p95Ms: +q(sorted, 0.95).toFixed(1),
    maxMs: +sorted[sorted.length - 1].toFixed(1),
    totalMs: +a.reduce((s, n) => s + n, 0).toFixed(1),
  };
};

const root = mkdtempSync(join(tmpdir(), 'specflow-perf-Ż '));
try {
  const result = {
    os: process.platform,
    arch: process.arch,
    node: process.version,
    git: command('git', ['--version']),
    tempRoot: root,
    inheritedGitConfig: {},
  };
  console.log('[perf] starting process/Git microbenchmark');
  for (let i = 0; i < 40; i++) {
    measure('node --version', () => command(process.execPath, ['--version']));
    git(['--version'], root, 'git --version');
  }
  const repo = join(root, 'baseline');
  mkdirSync(repo);
  git(['init', '-q'], repo, 'git init');
  try {
    result.inheritedGitConfig.autocrlf = command('git', ['config', '--show-origin', '--get', 'core.autocrlf'], repo);
  } catch { result.inheritedGitConfig.autocrlf = '(unset)'; }
  // Match the production expectations while keeping global runner state intact.
  git(['config', 'core.autocrlf', 'false'], repo, 'git config');
  mkdirSync(join(repo, '.nevo'));
  writeFileSync(join(repo, '.gitignore'), '.nevo/local/\n');
  writeFileSync(join(repo, '.nevo', 'config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(['add', '.gitignore', '.nevo/config.yaml'], repo, 'git add');
  git(['-c', 'user.name=SpecFlow Test', '-c', 'user.email=specflow@example.invalid', 'commit', '-qm', 'initial'], repo, 'git commit');
  for (let i = 0; i < 40; i++) {
    git(['status', '--porcelain'], repo, 'git status');
    git(['rev-parse', 'HEAD'], repo, 'git rev-parse');
  }
  for (let i = 0; i < 8; i++) {
    const workspace = join(root, 'worktree-' + i);
    git(['worktree', 'add', '-q', '-b', 'specflow-perf-' + i, workspace], repo, 'git worktree add');
    git(['worktree', 'remove', '--force', workspace], repo, 'git worktree remove');
    git(['branch', '-D', 'specflow-perf-' + i], repo, 'git branch delete');
  }
  result.summary = Object.fromEntries([...samples].map(([key, values]) => [key, describe(values)]));
  console.log('[perf] JSON summary follows');
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
