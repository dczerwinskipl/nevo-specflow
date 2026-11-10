import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { refreshIndex } from '@nevo/ai-semantic-search';
import {
  createFakeEmbeddingProvider,
  createInMemoryVectorStore,
} from '@nevo/ai-semantic-search/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_DOCS_SETTINGS, parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { createDocsChunkSource } from '../semantic-index/chunk-source';
import { READ_REFRESH_MAX_CHUNKS } from '../semantic-index/refresh-policy';
import { snippet } from './result';
import { openDocsSearch, searchDocumentation, type DocsSearch } from './search';

const root = mkdtempSync(join(tmpdir(), 'specflow-docs-search-'));
mkdirSync(join(root, 'docs', 'ideas'), { recursive: true });
const doc = (id: string, status: string, body: string) =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id} title\nstatus: ${status}\n---\n\n${body}\n`;
writeFileSync(
  join(root, 'docs', 'guide.md'),
  doc(
    'guide',
    'current',
    '# Guide\n\n## Install\n\nInstall the widget with pnpm.\n\n## Configure\n\nPoint the embedding endpoint at a local model.',
  ),
);
writeFileSync(
  join(root, 'docs', 'old.md'),
  doc('old', 'superseded', '# Old\n\nInstall the widget by hand.'),
);
writeFileSync(
  join(root, 'docs', 'ideas', 'draft.md'),
  doc('draft', 'draft', '# Draft\n\nA widget install idea.'),
);

writeFileSync(join(root, 'docs', 'docs.yaml'), 'nonAuthoritative: [ideas]\n');

afterAll(() => rmSync(root, { recursive: true, force: true }));

const settings = parseDocsConfig({ search: { semantic: true } });
const corpus = openFileSystemCorpus(root, settings);

function semanticSearch() {
  const provider = createFakeEmbeddingProvider();
  const store = createInMemoryVectorStore();
  const search: DocsSearch = {
    chunks: createDocsChunkSource({ corpus }),
    vectors: { store, providers: { query: provider, documents: provider } },
  };

  return { provider, store, search };
}

const request = {
  query: 'install widget',
  limit: 5,
  includeNonAuthoritative: false,
  refresh: true,
};

describe('searchDocumentation', () => {
  it('builds the index on read, answers hybrid and then embeds only the query', async () => {
    const { provider, search } = semanticSearch();
    const first = await searchDocumentation(search, request);
    expect(first.mode).toBe('hybrid');
    expect(first.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(first.results[0]).toMatchObject({
      title: 'guide title',
      file: 'docs/guide.md',
      chunks: [{ headingPath: ['Guide', 'Install'], snippet: 'Install the widget with pnpm.' }],
    });

    const embedCalls = provider.calls.length;
    expect(await searchDocumentation(search, request)).toEqual(first);
    expect(provider.calls.slice(embedCalls).map((call) => call.purpose)).toEqual(['query']);
  });

  it('includes non-authoritative documents only with the switch; inactive ones never', async () => {
    const { search } = semanticSearch();
    const result = await searchDocumentation(search, { ...request, includeNonAuthoritative: true });
    expect(result.results.map((hit) => hit.id).sort()).toEqual(['draft', 'guide']);
  });

  it('answers lexically with BM25 results when the endpoint fails, without a document embed', async () => {
    const { provider, search } = semanticSearch();
    provider.failWith({ code: 'unreachable', message: 'connection refused' });
    const result = await searchDocumentation(search, request);
    expect(result).toMatchObject({ mode: 'lexical', reason: { code: 'endpoint-unreachable' } });
    expect(result.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(provider.calls.map((call) => call.texts)).toEqual([['probe']]);
  });

  it('answers lexically with index-building while another writer holds the index', async () => {
    const { store, search } = semanticSearch();
    const held = await store.openWriter();
    const result = await searchDocumentation(search, request);
    expect(result).toMatchObject({ mode: 'lexical', reason: { code: 'index-building' } });
    expect(result.results).not.toHaveLength(0);
    if (held.status === 'opened') {
      await held.writer.close();
    }
  });

  it('with refresh skipped, a missing index answers lexically without embedding documents', async () => {
    const { provider, search } = semanticSearch();
    const result = await searchDocumentation(search, { ...request, refresh: false });
    expect(result).toMatchObject({ mode: 'lexical', reason: { code: 'index-building' } });
    expect(provider.calls).toEqual([]);
  });

  it('does not build a large gap on read: lexical index-building until the index is complete', async () => {
    const { provider, store } = semanticSearch();
    const base = createDocsChunkSource({ corpus }).load().chunks;
    const many = Array.from({ length: 2 * READ_REFRESH_MAX_CHUNKS + 2 }, (_, index) => ({
      ...base[index % base.length]!,
      id: `${base[index % base.length]!.id}/${String(index)}`,
    }));
    const search: DocsSearch = {
      chunks: { load: () => ({ chunks: many, reparsed: 0 }) },
      vectors: { store, providers: { query: provider, documents: provider } },
    };

    const empty = await searchDocumentation(search, request);
    expect(empty).toMatchObject({ mode: 'lexical', reason: { code: 'index-building' } });
    expect(empty.mode === 'lexical' && empty.reason.message).toMatch(/docs semantic index/);
    expect(empty.results).not.toHaveLength(0);
    expect(provider.calls).toEqual([]);

    // A partial index (an interrupted build) is not complete either; once it is, search is hybrid.
    await refreshIndex({ chunks: many.slice(0, 2), provider, store });
    expect(await searchDocumentation(search, request)).toMatchObject({
      mode: 'lexical',
      reason: { code: 'index-building' },
    });
    await refreshIndex({ chunks: many, provider, store });
    expect((await searchDocumentation(search, request)).mode).toBe('hybrid');
  });
});

describe('openDocsSearch', () => {
  const endpoint = {
    protocol: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1/v1',
    model: 'm',
  } as const;

  it('writes nothing under .nevo when semantic search is not enabled', async () => {
    const search = openDocsSearch({
      projectRoot: root,
      corpus: openFileSystemCorpus(root, DEFAULT_DOCS_SETTINGS),
      configuration: { docs: DEFAULT_DOCS_SETTINGS, embeddings: endpoint },
      env: {},
    });
    const result = await searchDocumentation(search, request);
    expect(result).toMatchObject({ mode: 'lexical', reason: { code: 'semantic-disabled' } });
    expect(existsSync(join(root, '.nevo'))).toBe(false);
  });

  it('answers lexically when the API key variable is not set, without calling the endpoint', () => {
    let created = 0;
    const search = openDocsSearch({
      projectRoot: root,
      corpus,
      configuration: { docs: settings, embeddings: { ...endpoint, apiKeyEnv: 'DOCS_TEST_KEY' } },
      env: {},
      createProvider: () => {
        created += 1;

        return createFakeEmbeddingProvider();
      },
    });
    expect('reason' in search.vectors && search.vectors.reason.code).toBe('endpoint-unreachable');
    expect(created).toBe(0);
  });
  it('reuses an index the process already holds instead of opening another store', () => {
    const index = { chunks: createDocsChunkSource({ corpus }), store: createInMemoryVectorStore() };
    const search = openDocsSearch({
      projectRoot: root,
      corpus,
      configuration: { docs: settings, embeddings: endpoint },
      env: {},
      createProvider: () => createFakeEmbeddingProvider(),
      index,
    });
    expect(search.chunks).toBe(index.chunks);
    expect('store' in search.vectors && search.vectors.store).toBe(index.store);
  });
});

describe('snippet', () => {
  it('drops the partial first word of a continuation part', () => {
    expect(snippet('## Commit\nThe engine commits.')).toBe('The engine commits.');
    expect(snippet('ngine commits the documents.', true)).toBe('…commits the documents.');
  });
});

describe('docs chunk source', () => {
  it('re-reads only files whose stat changed and re-chunks only changed content, across instances', () => {
    const cacheFile = join(root, 'cache', 'units.json');
    const source = createDocsChunkSource({ corpus, cacheFile });
    expect(source.load().reparsed).toBe(3);
    expect(source.load().reparsed).toBe(0);

    // Same content, new mtime: one read and hash, no re-chunking.
    utimesSync(join(root, 'docs', 'old.md'), new Date(2001, 1, 1), new Date(2001, 1, 1));
    expect(source.load().reparsed).toBe(0);

    writeFileSync(join(root, 'docs', 'old.md'), doc('old', 'superseded', '# Old\n\nChanged.'));
    expect(source.load().reparsed).toBe(1);
    expect(createDocsChunkSource({ corpus, cacheFile }).load().reparsed).toBe(0);
  });

  it('treats a cache file of the wrong shape as an empty cache', () => {
    const cacheFile = join(root, 'cache', 'null.json');
    mkdirSync(join(root, 'cache'), { recursive: true });
    writeFileSync(cacheFile, 'null');
    expect(createDocsChunkSource({ corpus, cacheFile }).load().reparsed).toBe(3);
  });
});
