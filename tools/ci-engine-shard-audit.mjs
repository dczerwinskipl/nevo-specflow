import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Audit of the Windows engine shards (engine-filesystem.yml). Runs every `--list` of the matrix and
 * fails when a test file under packages/specflow-engine/test is in no rest shard or in more than
 * one, when a rest shard is empty, or when the hot shards do not cover each case of the hot file
 * exactly once. The shard scripts themselves already fail closed on test declarations they do not
 * recognise; this check makes a new test file's placement visible and enforced on every pull request.
 *
 * Usage: node tools/ci-engine-shard-audit.mjs
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = join(root, 'packages', 'specflow-engine');
const workflow = readFileSync(join(root, '.github', 'workflows', 'engine-filesystem.yml'), 'utf8');
const matrix = [...workflow.matchAll(/\{ kind: (hot|rest), part: (\d+), total: (\d+) \}/g)].map(
  (m) => ({ kind: m[1], part: Number(m[2]), total: Number(m[3]) }),
);
if (matrix.length === 0) {
  throw new Error('No Windows shard matrix found in engine-filesystem.yml');
}

function list(kind, part, total) {
  const run = spawnSync(
    process.execPath,
    [join(root, 'tools', `ci-engine-${kind}-shard.mjs`), String(part), String(total), '--list'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    throw new Error(`${kind} shard ${part}/${total} failed:\n${run.stderr}`);
  }

  return JSON.parse(run.stdout);
}

function discover(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const path = join(folder, item.name);
    if (item.isDirectory()) {
      return discover(path);
    }

    return item.isFile() && item.name.endsWith('.test.ts')
      ? [relative(engineRoot, path).split(sep).join('/')]
      : [];
  });
}

const problems = [];
const hot = 'test/git/git-integration-proof.test.ts';
const restFiles = new Map();
const hotCases = new Map();
let allHotCases = 0;
for (const { kind, part, total } of matrix) {
  const summary = list(kind, part, total);
  if (kind === 'rest') {
    for (const file of summary.selected) {
      restFiles.set(file, (restFiles.get(file) ?? 0) + 1);
    }

    console.log(
      `rest ${part}/${total}: ${summary.selected.length} files, ~${summary.estimatedSeconds}s`,
    );
  } else {
    allHotCases = summary.allCases;
    for (const name of summary.cases) {
      hotCases.set(name, (hotCases.get(name) ?? 0) + 1);
    }

    console.log(`hot ${part}/${total}: ${summary.selectedCases} of ${summary.allCases} cases`);
  }
}

const expected = discover(join(engineRoot, 'test')).filter((file) => file !== hot);
for (const file of expected) {
  const count = restFiles.get(file) ?? 0;
  if (count !== 1) {
    problems.push(`${file}: in ${count} rest shards (expected 1)`);
  }
}

for (const file of restFiles.keys()) {
  if (!expected.includes(file)) {
    problems.push(`${file}: listed in a shard but not on disk`);
  }
}

const hotTotal = [...hotCases.values()].reduce((sum, n) => sum + n, 0);
if (
  hotCases.size !== allHotCases ||
  hotTotal !== allHotCases ||
  [...hotCases.values()].some((n) => n !== 1)
) {
  problems.push(`hot shards cover ${hotCases.size}/${allHotCases} cases, ${hotTotal} selections`);
}

console.log(`${expected.length} rest files, ${allHotCases} hot cases, ${matrix.length} shards`);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('shard audit ok');
