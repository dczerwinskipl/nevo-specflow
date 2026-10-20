import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Temporary benchmark: shard one expensive integration test file by test case.
 * Every test still runs real Git and isolated per-case Git repos; no mocks,
 * shortened assertions, parallel execution inside one Vitest worker, or retries.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = join(root, 'packages', 'specflow-engine');
const fileName = 'test/git-integration-proof.test.ts';
const source = readFileSync(join(engineRoot, fileName), 'utf8');
const part = Number(process.argv[2]);
const total = Number(process.argv[3]);
const listOnly = process.argv.includes('--list');

if (!Number.isInteger(part) || !Number.isInteger(total) || part < 1 || total < 1 || part > total || total > 12) {
  throw new Error('Usage: node tools/ci-engine-hot-shard.mjs <part> <total> [--list]');
}

// The file has ordinary it('...') cases and an OS-conditional it.skipIf(...)(...).
// Refuse to silently lose coverage if test declaration syntax changes.
const allDeclarations = [...source.matchAll(/^\s*(?:it|test)(?:\.[a-zA-Z]+)?\(/gm)];
const namedCases = [...source.matchAll(/^\s*it(?:\.skipIf\([^\n]*?\))?\(\s*(['"])([^\n]*?)\1/gm)].map(
  (match) => match[2],
);
if (namedCases.length !== allDeclarations.length || new Set(namedCases).size !== namedCases.length) {
  throw new Error(
    'Unrecognized or duplicated test declaration; update the sharding parser before running.',
  );
}

const buckets = Array.from({ length: total }, () => []);
namedCases.forEach((name, index) => buckets[index % total].push(name));
const selected = buckets[part - 1];
if (!selected?.length) throw new Error('Selected empty test shard.');
const escapeRegex = (name) => name.replace(/[\^$.*+?()[\]{}|]/g, '\\$&');
const pattern = '(?:' + selected.map(escapeRegex).join('|') + ')$';

console.log(
  JSON.stringify({
    file: fileName,
    shard: part + '/' + total,
    allCases: namedCases.length,
    selectedCases: selected.length,
    cases: selected,
  }, null, 2),
);
if (listOnly) process.exit(0);

const vitestMain = join(engineRoot, 'node_modules', 'vitest', 'vitest.mjs');
const args = [
  vitestMain,
  'run',
  fileName,
  '--testNamePattern',
  pattern,
  '--testTimeout=20000',
  '--maxWorkers=1',
  '--no-file-parallelism',
  '--reporter=verbose',
];
const child = spawnSync(process.execPath, args, {
  cwd: engineRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});
if (child.error) throw child.error;
if (child.signal) {
  console.error('Vitest terminated by signal:', child.signal);
  process.exit(1);
}
process.exit(child.status ?? 1);
