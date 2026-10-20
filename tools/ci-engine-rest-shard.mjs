import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Windows full-regression experiment, excluding the hot integration-proof file
 * which is partitioned by test name in ci-engine-hot-shard.mjs.
 * Historical durations are from PR #53 Windows run 39288746460.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = join(root, 'packages', 'specflow-engine');
const testRoot = join(engineRoot, 'test');
const hot = 'test/git-integration-proof.test.ts';
const part = Number(process.argv[2]);
const total = Number(process.argv[3]);
if (!Number.isInteger(part) || !Number.isInteger(total) || part < 1 || part > total || total < 1 || total > 12) {
  throw new Error('Usage: node tools/ci-engine-rest-shard.mjs <part> <total> [--list]');
}

function discover(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const path = join(folder, item.name);
    if (item.isDirectory()) return discover(path);
    if (!item.isFile() || !item.name.endsWith('.test.ts')) return [];
    return [relative(engineRoot, path).split(sep).join('/')];
  });
}
const allFiles = discover(testRoot).sort();
if (!allFiles.includes(hot)) throw new Error('Pinned hot test file is missing from the suite.');
const files = allFiles.filter((name) => name !== hot);

// Duration estimates in seconds, from the previous Windows full run.
// New tests always enter a shard; unknown files use a conservative estimate.
const known = {
  'close-sigkill': 742,
  'lifecycle-admission': 681,
  'durable-create': 530,
  'close-worktree-lifecycle': 518,
  'close-process-contention': 373,
  'archive-close': 314,
  'create-multiprocess': 301,
  'close-specification-lifecycle': 281,
  'create-crash-recovery': 185,
  'spec-discovery': 132,
  'registry-coordination': 86,
  'version-control-legacy-regression': 69,
  'create-journal-contract': 53,
  'version-control-adapter': 35,
  'quality-hardening-q01-codec': 33,
  'lifecycle-journal-scope': 27,
  'create-journal': 14,
  'project-home': 11,
  'platform-filesystem-contract': 9,
  'quality-hardening-q00-journals': 8,
  'workspace-registry': 4,
  'git-checkout': 1,
  'specifications': 1,
  'version-control-policy': 1,
  'shared-resource-coordination': 1,
  'git-output-decoder': 1,
};
function weight(file) {
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.test\.ts$/, '');
  return known[base] ?? (file.includes('/fixtures/') ? 1 : 60);
}
const buckets = Array.from({ length: total }, () => ({ seconds: 0, files: [] }));
for (const file of files.sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
  const target = buckets.reduce((best, bucket) => bucket.seconds < best.seconds ? bucket : best);
  target.files.push(file);
  target.seconds += weight(file);
}
const selected = buckets[part - 1];
if (!selected?.files.length) throw new Error('Selected empty test shard.');

console.log(JSON.stringify({
  shard: part + '/' + total,
  filesInSuite: allFiles.length,
  assignedAcrossRest: buckets.reduce((sum, bucket) => sum + bucket.files.length, 0),
  estimatedSeconds: selected.seconds,
  selected: selected.files,
}, null, 2));
if (process.argv.includes('--list')) process.exit(0);

const vitestMain = join(engineRoot, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawnSync(process.execPath, [
  vitestMain,
  'run',
  ...selected.files,
  '--testTimeout=20000',
  '--maxWorkers=1',
  '--no-file-parallelism',
  '--reporter=verbose',
], {
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
