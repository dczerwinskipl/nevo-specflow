import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Evaluates sample changed files against the pull_request `paths` globs of windows-smoke.yml
 * (GitHub semantics: `*` does not cross `/`, `**` does). Documents which changes start the check.
 *
 * Usage: node tools/ci-windows-smoke-paths.mjs [changed/file ...]
 *   With files: prints whether each triggers. Without: runs the built-in cases and exits 1 on mismatch.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'windows-smoke.yml'), 'utf8');
const block = workflow.match(/pull_request:[\s\S]*?\n {4}paths:\n((?: {6}- .*\n)+)/);
if (!block) throw new Error('Cannot find pull_request.paths in windows-smoke.yml');
const globs = [...block[1].matchAll(/- "(.*)"/g)].map((m) => m[1]);

const toRegex = (glob) =>
  new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '\u0000')
        .replace(/\*\*/g, '\u0001')
        .replace(/\*/g, '[^/]*')
        .replaceAll('\u0000', '(?:.*/)?')
        .replaceAll('\u0001', '.*') +
      '$',
  );
const regexes = globs.map(toRegex);
export const triggers = (file) => regexes.some((re) => re.test(file));

if (process.argv.length > 2) {
  for (const file of process.argv.slice(2))
    console.log(`${triggers(file) ? 'RUNS ' : 'skips'} ${file}`);
  process.exit(0);
}

const cases = [
  // [changed file, expected to trigger]
  ['packages/specflow-engine/src/specs/create/journal/store.ts', true],
  ['packages/specflow-engine/src/specs/create/git/commit.ts', true],
  ['packages/specflow-engine/src/git/index.ts', true],
  ['packages/specflow-engine/test/create/create-commit.test.ts', true],
  ['packages/specflow-runtime/src/features/specs/http.ts', true],
  ['packages/specflow-runtime/test/specs/create-async.http.test.ts', true],
  ['packages/specflow-contracts/src/specs/create.ts', true],
  ['packages/specflow/src/documents/command.ts', true],
  ['packages/specflow-engine/src/specs/documents/queue/claim.ts', true],
  ['tools/ci-windows-smoke-tests.json', true],
  ['.github/workflows/windows-smoke.yml', true],
  ['packages/specflow-ui/src/components/button.tsx', false],
  ['packages/specflow-product/src/create/create-form.tsx', false],
  ['packages/specflow-runtime/src/features/auth/login.ts', false],
  ['packages/specflow-contracts/src/tasks/task.ts', false],
  ['packages/specflow/src/program.ts', false],
  ['docs/engineering/repository/ci.md', false],
  ['.github/workflows/ci.yml', false],
];
let bad = 0;
for (const [file, expected] of cases) {
  const actual = triggers(file);
  if (actual !== expected) bad += 1;
  console.log(`${actual === expected ? 'ok  ' : 'FAIL'} ${actual ? 'RUNS ' : 'skips'} ${file}`);
}
process.exit(bad ? 1 : 0);
