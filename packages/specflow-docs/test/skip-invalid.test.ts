// Reads skip documents that cannot be trusted and report them; `check` stays strict (ADR 0022).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_DOCS_SETTINGS } from '../src/config/docs-settings';
import { openFileSystemCorpus } from '../src/corpus/corpus';
import { findDocuments, getContext, getDocuments } from '../src/discovery/documents';
import { DocsUsageError } from '../src/errors';
import { searchDocumentation } from '../src/search/search';
import { createDocsChunkSource } from '../src/semantic-index/chunk-source';
import { checkDocumentation } from '../src/validation/check';
import { runDocs } from './support/run-docs';

// good: valid; broken: invalid status; twin-a / twin-b: same id; dangling: unresolved `related`;
// plain: no frontmatter; yaml: malformed YAML; scoped: scope outside the taxonomy.
const root = mkdtempSync(join(tmpdir(), 'specflow-docs-skip-'));
mkdirSync(join(root, 'docs'));
const doc = (file: string, fields: string) =>
  writeFileSync(
    join(root, 'docs', file),
    `---\n${fields}\n---\n\n# ${file}\n\nInstall the widget.\n`,
  );
doc('good.md', 'id: good\ntype: hub\ntitle: Good\nstatus: current');
doc('broken.md', 'id: broken\ntype: hub\ntitle: Broken\nstatus: bogus');
doc('twin-a.md', 'id: twin\ntype: hub\ntitle: Twin A\nstatus: current');
doc('twin-b.md', 'id: twin\ntype: hub\ntitle: Twin B\nstatus: current');
doc('dangling.md', 'id: dangling\ntype: hub\ntitle: Dangling\nstatus: current\nrelated: [nowhere]');
doc('yaml.md', 'id: [unclosed\ntype: hub');
doc('scoped.md', 'id: scoped\ntype: hub\ntitle: Scoped\nstatus: current\nscope: other');
writeFileSync(join(root, 'docs', 'plain.md'), '# No frontmatter\n');
writeFileSync(join(root, 'docs', 'docs.yaml'), 'taxonomy:\n  scopes: [repo]\n');

afterAll(() => rmSync(root, { recursive: true, force: true }));

const corpus = openFileSystemCorpus(root, DEFAULT_DOCS_SETTINGS);
const skippedPaths = [
  'docs/broken.md',
  'docs/plain.md',
  'docs/scoped.md',
  'docs/twin-a.md',
  'docs/twin-b.md',
  'docs/yaml.md',
];

describe('reads skip invalid documents', () => {
  it('list, find and context use the valid documents and name the skipped ones', () => {
    const listed = findDocuments(corpus, {});
    expect(listed.documents.map((d) => d.id)).toEqual(['dangling', 'good']);
    expect(listed.skipped.map((s) => s.path)).toEqual(skippedPaths);
    expect(findDocuments(corpus, { query: 'good' }).documents.map((d) => d.id)).toEqual(['good']);

    const context = getContext(corpus, { query: 'good dangling' });
    expect(context.documents.map((d) => d.id).sort()).toEqual(['dangling', 'good']);
    expect(context.skipped).toHaveLength(skippedPaths.length);
  });

  it('get resolves a document with a dangling reference and fails once naming every problem', () => {
    expect(getDocuments(corpus, ['dangling']).documents[0]!.id).toBe('dangling');
    expect(() => getDocuments(corpus, ['twin', 'nope'])).toThrow(DocsUsageError);
    expect(() => getDocuments(corpus, ['twin', 'nope'])).toThrow(
      /skipped document id\(s\): 'twin' skipped in docs\/twin-a\.md: .*; unknown document id\(s\): nope/,
    );
  });

  it('the chunk source and search skip them too', async () => {
    const chunks = createDocsChunkSource({ corpus });
    expect((await chunks.load()).skipped.map((s) => s.path)).toEqual(skippedPaths);

    const vectors = { reason: { code: 'semantic-disabled' as const, message: 'off' } };
    const result = await searchDocumentation(
      { chunks, vectors },
      {
        query: 'widget',
        limit: 5,
        includeProposals: false,
        snippets: false,
        refresh: false,
      },
    );
    expect(result.results.map((hit) => hit.id).sort()).toEqual(['dangling', 'good']);
    expect(result.skipped?.map((s) => s.path)).toEqual(skippedPaths);
  });

  it('the CLI warns once per skipped document on stderr and carries skipped in --json', async () => {
    const text = await runDocs(root, ['list']);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toHaveLength(skippedPaths.length);
    expect(text.stderr[0]).toMatch(/^warning: skipped docs\/broken\.md: .*unknown status/);
    expect(text.stdout).toHaveLength(2);

    const json = await runDocs(root, ['get', '--json', 'good']);
    const parsed = JSON.parse(json.stdout.join('\n')) as { skipped: unknown[] };
    expect(parsed.skipped).toHaveLength(skippedPaths.length);
    expect((await runDocs(root, ['get', 'twin'])).exitCode).toBe(2);
  });

  it('check stays strict and reports malformed YAML instead of throwing', () => {
    const text = checkDocumentation(corpus, { checkWriteCommand: 'check --write' }).problems.join(
      '\n',
    );
    for (const problem of [
      /unknown status 'bogus'/,
      /duplicate id 'twin'/,
      /unresolved reference 'nowhere'/,
      /Invalid YAML frontmatter in docs\/yaml\.md/,
      /docs\/plain\.md: missing frontmatter/,
      /unknown scope 'other'/,
    ]) {
      expect(text).toMatch(problem);
    }
  });
});
