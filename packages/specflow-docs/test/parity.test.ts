// Behavioral parity with the repository tool this package was promoted from (`tools/docs`,
// `nevo-docs`). `fixtures/parity/expected-*` were captured once by running the former `tools/docs`
// implementation over `fixtures/parity/docs` (its hard-coded taxonomy and `docs/ideas/**`
// exclusion). The product reads the same vocabulary from `docs/docs.yaml` and must answer
// identically.
// One intended difference: the generated index names the product command
// (`nevo-specflow docs check --write`) whatever host wrote it, so `expected-index.generated.md`
// carries that text in its two header lines; check hints on stderr still use the host's command.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { runDocs, type DocsRun } from './support/run-docs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'parity');

interface ExpectedRun extends DocsRun {
  readonly args: string[];
  /** Added before this run: `fixtures/parity/stray.md`, outside the taxonomy, with broken links. */
  readonly addStray?: boolean;
}

const expectedRuns = JSON.parse(
  readFileSync(join(fixtures, 'expected-outputs.json'), 'utf8'),
) as ExpectedRun[];

// The vocabulary `tools/docs` hard-codes, declared in the documentation settings file.
const DOCS_FILE = `taxonomy:
  scopes: [shared, repo, specflow, nevo-ui]
  areas: [ai, workflow, runtime, server, cli, ui, figma, testing, docs, release, security, configuration]
proposals: [ideas/]
`;

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-parity-'));
cpSync(join(fixtures, 'docs'), join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'docs.yaml'), DOCS_FILE);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('parity with tools/docs on the fixture corpus', () => {
  it('answers list, find, get, context and check identically and writes the same index', async () => {
    for (const expected of expectedRuns) {
      if (expected.addStray) {
        // Compare the index before the corpus is made invalid.
        expect(readFileSync(join(root, 'docs', 'index.generated.json'), 'utf8')).toBe(
          readFileSync(join(fixtures, 'expected-index.generated.json'), 'utf8'),
        );
        expect(readFileSync(join(root, 'docs', 'index.generated.md'), 'utf8')).toBe(
          readFileSync(join(fixtures, 'expected-index.generated.md'), 'utf8'),
        );
        cpSync(join(fixtures, 'stray.md'), join(root, 'docs', 'engineering', 'stray.md'));
      }

      const actual = await runDocs(root, expected.args, 'pnpm docs:check --write');
      expect({ args: expected.args, ...actual }).toEqual({
        args: expected.args,
        exitCode: expected.exitCode,
        stdout: expected.stdout,
        stderr: expected.stderr,
      });
    }
  });
});
