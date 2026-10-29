import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/**
 * Decide how much of the shared Storybook corpus a pull request must run.
 *
 * Input: changed repo-relative paths. Output: `{ mode, filters }` where
 *   - `full`     run every story (design system or Storybook tooling changed),
 *   - `filtered` run only stories under `filters` (vitest path filters),
 *   - `none`     run no Storybook tests (docs-only or unrelated change).
 *
 * Usage:
 *   node tools/ci-storybook-scope.mjs <base-ref> <head-ref>   # diffs base...head
 *   node tools/ci-storybook-scope.mjs --stdin                 # one path per line
 *   node tools/ci-storybook-scope.mjs --self-test
 */

const STORY = /\.stories\.(?:js|jsx|mjs|ts|tsx)$/;

// A change here can alter every story: re-run the whole corpus.
const FULL_PATTERNS = [
  /^packages\/nevo-ui\/(?!.*\.md$)/,
  /^tools\/storybook\//,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tools\/ci-storybook-scope\.mjs$/,
];

export function storybookScope(changed) {
  const files = changed
    .map((f) => f.trim().split(String.fromCharCode(92)).join('/'))
    .filter(Boolean);
  if (files.some((f) => FULL_PATTERNS.some((p) => p.test(f)))) {
    return { mode: 'full', filters: [] };
  }

  const filters = new Set();
  for (const f of files) {
    if (/^packages\/specflow-ui\/(?!.*\.md$)/.test(f)) {
      filters.add('packages/specflow-ui/');
    }

    const example = /^examples\/([^/]+)\/(?:src|package\.json)/.exec(f);
    if (example) {
      filters.add(`examples/${example[1]}/`);
    }
  }

  for (const f of files) {
    // A directly changed story only needs its own filter when no directory filter covers it.
    if (STORY.test(f) && ![...filters].some((d) => d.endsWith('/') && f.startsWith(d))) {
      filters.add(f);
    }
  }

  return filters.size > 0
    ? { mode: 'filtered', filters: [...filters].sort() }
    : { mode: 'none', filters: [] };
}

function selfTest() {
  const t = (files, mode, filters = []) =>
    assert.deepEqual(storybookScope(files), { mode, filters });
  t(['packages/nevo-ui/src/combobox/combobox.tsx'], 'full');
  t(['packages/nevo-ui/src/x.css', 'docs/a.md'], 'full');
  t(['packages/nevo-ui/README.md'], 'none');
  t(['packages/specflow-ui/src/foo.tsx'], 'filtered', ['packages/specflow-ui/']);
  t(['packages/specflow-ui/src/foo.tsx', 'examples/crm/src/a.stories.tsx'], 'filtered', [
    'examples/crm/',
    'packages/specflow-ui/',
  ]);
  t(['examples/crm/src/x.stories.tsx'], 'filtered', ['examples/crm/']);
  t(['packages/other/src/y.stories.tsx'], 'filtered', ['packages/other/src/y.stories.tsx']);
  t(['docs/engineering/repository/ci.md', 'README.md'], 'none');
  t(['packages/specflow-engine/src/a.ts'], 'none');
  t(['tools/storybook/.storybook/preview.ts'], 'full');
  t(['pnpm-lock.yaml'], 'full');
  t(['packages/nevo-ui/src/a.tsx'.split('/').join(String.fromCharCode(92))], 'full');
  t([], 'none');
  console.log('ci-storybook-scope self-test passed');
}

const args = process.argv.slice(2);
if (
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  if (args[0] === '--self-test') {
    selfTest();
  } else {
    let list;
    if (args[0] === '--stdin') {
      list = (await readStdin()).split('\n');
    } else if (args.length === 2) {
      list = execFileSync('git', ['diff', '--name-only', `${args[0]}...${args[1]}`], {
        encoding: 'utf8',
      }).split('\n');
    } else {
      throw new Error('Usage: ci-storybook-scope.mjs <base> <head> | --stdin | --self-test');
    }

    process.stdout.write(`${JSON.stringify(storybookScope(list))}\n`);
  }
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }

  return data;
}
