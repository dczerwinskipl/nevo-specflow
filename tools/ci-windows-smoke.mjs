import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Windows smoke slice: runs ONLY the tests listed in ci-windows-smoke-tests.json, with the real
 * Git/filesystem, one worker and no file parallelism. Fails closed when a listed test is missing,
 * and names every failed test in the output and in the GitHub step summary.
 *
 * Usage: node tools/ci-windows-smoke.mjs [--list]
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'tools', 'ci-windows-smoke-tests.json'), 'utf8'));
const listOnly = process.argv.includes('--list');
const escapeRegex = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const problems = [];
for (const entry of config.entries) {
  const path = join(root, entry.dir, entry.file);
  if (!existsSync(path)) {
    problems.push(`${entry.dir}/${entry.file}: file not found`);
    continue;
  }

  const source = readFileSync(path, 'utf8');
  for (const name of entry.tests) {
    const found = ["'", '"', '`'].some((q) => source.includes(`it(${q}${name}${q}`));
    if (!found) {
      problems.push(`${entry.dir}/${entry.file}: no it(...) titled "${name}"`);
    }
  }
}

if (problems.length) {
  console.error('Windows smoke list is stale, update tools/ci-windows-smoke-tests.json:');
  for (const problem of problems) {
    console.error('  - ' + problem);
  }

  process.exit(2);
}

console.log(JSON.stringify(config, null, 2));
if (listOnly) {
  process.exit(0);
}

const failed = [];
let executed = 0;
const scratch = mkdtempSync(join(tmpdir(), 'windows-smoke-'));
try {
  config.entries.forEach((entry, index) => {
    const reportFile = join(scratch, `report-${index}.json`);
    const cwd = join(root, entry.dir);
    const pattern = '(?:' + entry.tests.map(escapeRegex).join('|') + ')$';
    const result = spawnSync(
      process.execPath,
      [
        join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        entry.file,
        '--testNamePattern',
        pattern,
        `--testTimeout=${config.testTimeoutMs}`,
        '--maxWorkers=1',
        '--no-file-parallelism',
        '--reporter=verbose',
        '--reporter=json',
        `--outputFile.json=${reportFile}`,
      ],
      { cwd, env: process.env, stdio: 'inherit', windowsHide: true },
    );
    if (result.error) {
      throw result.error;
    }

    let passedHere = 0;
    if (existsSync(reportFile)) {
      const report = JSON.parse(readFileSync(reportFile, 'utf8'));
      for (const file of report.testResults ?? []) {
        for (const test of file.assertionResults ?? []) {
          if (test.status === 'passed') {
            passedHere += 1;
          } else if (test.status === 'failed') {
            failed.push(`${entry.file} > ${test.fullName}`);
          }
        }
      }
    }

    executed += passedHere;
    if (result.status !== 0 && !failed.some((name) => name.startsWith(entry.file + ' >'))) {
      failed.push(
        `${entry.file} > (vitest exited ${result.status ?? result.signal} without a test result)`,
      );
    }

    if (
      passedHere + failed.filter((n) => n.startsWith(entry.file + ' >')).length <
      entry.tests.length
    ) {
      failed.push(`${entry.file} > (fewer tests ran than the ${entry.tests.length} listed)`);
    }
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const expected = config.entries.reduce((sum, entry) => sum + entry.tests.length, 0);
const lines = failed.length
  ? [`### windows smoke: ${failed.length} problem(s)`, ...failed.map((name) => `- ${name}`)]
  : [`### windows smoke: ${executed}/${expected} tests passed`];
console.log('\n' + lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

process.exit(failed.length ? 1 : 0);
