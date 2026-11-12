import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { openDocsSearch, searchDocumentation } from '../search/search';
import { buildDocsIndex } from './build';
import { openProjectIndex } from './index-store';
import { readLatestProgress } from './progress';

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-admission-'));
mkdirSync(join(root, 'docs'));
const guide = (install: string) =>
  `---\nid: guide\ntype: hub\ntitle: Guide\nstatus: current\n---\n\n# Guide\n\n## Install\n\n${install}\n`;
writeFileSync(join(root, 'docs', 'guide.md'), guide('Install the widget.'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const configuration = {
  docs: parseDocsConfig({ search: { semantic: true } }),
  embeddings: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
} as const;
const request = {
  query: 'install widget',
  limit: 5,
  includeNonAuthoritative: false,
  snippets: false,
  refresh: true,
};

/** The index directory's files, progress record names generalised. */
const files = (directory: string) =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/').replace(/^progress-.*\.json$/, 'progress-*.json'))
    .sort();

describe('write admission', () => {
  it('checks before every write, also of a running refresh, and searches lexically once refused', async () => {
    // One answer per check, in order: opening, then the first refresh's chunk cache, writer lock
    // and slice; the second refresh's chunk cache and lock are admitted and its slice is refused,
    // and so is the next search's re-check.
    const answers = [true, true, true, true, true, true, false, false];
    const asked: string[] = [];
    const isIgnored = (_root: string, path: string) => {
      asked.push(path);

      return Promise.resolve(answers.shift() ?? true);
    };

    const corpus = openFileSystemCorpus(root, configuration.docs);
    const index = await openProjectIndex(root, corpus, configuration, isIgnored);
    const provider = createFakeEmbeddingProvider();
    const environment = { env: {}, createProvider: () => provider };
    const generation = async () => {
      const manifest = await index.store.readManifest();

      return manifest.status === 'ok' ? manifest.manifest.generation : undefined;
    };

    const vectorFiles = () =>
      files(index.directory).filter((name) => !name.startsWith('vectors/writer-'));

    expect(await buildDocsIndex(index, configuration, environment)).toMatchObject({
      status: 'done',
      outcome: { status: 'refreshed' },
    });
    expect(asked).toHaveLength(4);
    const built = await generation();
    const builtFiles = vectorFiles();

    writeFileSync(join(root, 'docs', 'guide.md'), guide('Install the widget with pnpm.'));
    expect(await buildDocsIndex(index, configuration, environment)).toMatchObject({
      status: 'done',
      outcome: { status: 'write-failed' },
      reason: { code: 'index-unavailable' },
    });
    expect(asked).toHaveLength(7);
    expect(new Set(asked)).toEqual(new Set(['.nevo/local/cache/docs-index/']));
    // Nothing after the refused slice: the existing generation stays, no finished progress record;
    // only the lock the admitted writer took is released.
    expect(await generation()).toBe(built);
    expect(vectorFiles()).toEqual(builtFiles);
    expect((await readLatestProgress(index.directory))?.state).toBe('running');
    const afterRefusal = files(index.directory);

    const search = openDocsSearch({
      corpus,
      configuration,
      env: {},
      createProvider: () => provider,
      index,
    });
    const embedded = provider.calls.length;
    const refused = await searchDocumentation(search, request);
    expect(refused).toMatchObject({
      mode: 'lexical',
      reason: {
        code: 'index-unavailable',
        message: expect.stringContaining('add `.nevo/local/` to the project') as unknown,
      },
    });
    expect(refused.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(answers).toEqual([]);
    expect(provider.calls.length).toBe(embedded);
    expect(files(index.directory)).toEqual(afterRefusal);

    // No answer is reused: once Git ignores the index again, the next search writes it.
    expect((await searchDocumentation(search, request)).mode).toBe('hybrid');
    expect(asked).toHaveLength(11);
    expect(await generation()).toBeGreaterThan(built!);
  });
});
