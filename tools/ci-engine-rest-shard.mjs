import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Partition the remaining real-Git filesystem tests by measured Windows duration.
 * The expensive integration-proof file is partitioned separately by test case.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = join(root, 'packages', 'specflow-engine');
const testRoot = join(engineRoot, 'test');
const hot = 'test/git-integration-proof.test.ts';
const part = Number(process.argv[2]);
const total = Number(process.argv[3]);
if (
  !Number.isInteger(part) ||
  !Number.isInteger(total) ||
  part < 1 ||
  part > total ||
  total < 1 ||
  total > 12
) {
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

// Historical durations in seconds from the Windows run 39288746460 of the Create branch.
// New test files are discovered automatically and assigned a conservative weight.
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
  platform: 1,
  // Document write and queue suites (Linux seconds x about 10 on a Windows runner); the others keep the default.
  'document-queue-faults': 900,
  'document-state-machine': 900,
  'document-writer-faults': 450,
  'document-queue': 350,
  'document-queue-failures': 350,
  'document-queue-held': 250,
  'document-uncommitted': 250,
  // Manual commit, reads, scheduler and Create commit suites: measured on Linux, scaled by the median Windows/Linux ratio (about 12.5) of the suites above.
  'manual-commit': 325,
  'manual-commit-recovery': 303,
  'manual-commit-crash': 305,
  'document-reader-tree': 223,
  'document-scheduler': 169,
  'document-commit-reads': 167,
  'document-change-commit': 153,
  'create-commit': 1000,
  'document-uncommitted-crash': 1,
  'document-writer-crash': 1,
  'document-queue-crash': 1,
  'document-crash-cutpoints': 1,
  'document-contention': 1,
  'workspace-registry': 4,
  'git-checkout': 1,
  specifications: 1,
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
  const target = buckets.reduce((best, bucket) => (bucket.seconds < best.seconds ? bucket : best));
  target.files.push(file);
  target.seconds += weight(file);
}
const selected = buckets[part - 1];
if (!selected?.files.length) throw new Error('Selected empty test shard.');

const summary = {
  shard: part + '/' + total,
  filesInSuite: allFiles.length,
  assignedAcrossRest: buckets.reduce((sum, bucket) => sum + bucket.files.length, 0),
  estimatedSeconds: selected.seconds,
  selected: selected.files,
};
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes('--list')) process.exit(0);

const vitestMain = join(engineRoot, 'node_modules', 'vitest', 'vitest.mjs');
const args = [
  vitestMain,
  'run',
  ...selected.files,
  '--testTimeout=120000',
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
