import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSearchEngine, refreshIndex } from '@nevo/ai-semantic-search';
import {
  createFakeEmbeddingProvider,
  createInMemoryVectorStore,
} from '@nevo/ai-semantic-search/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_DOCS_SETTINGS, parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { contextualHeader, createDocsChunkSource } from '../semantic-index/chunk-source';
import { openDocsIndex, openProjectIndex } from '../semantic-index/index-store';
import { cacheNotIgnoredReason } from '../semantic-index/reasons';
import { READ_REFRESH_MAX_CHUNKS } from '../semantic-index/refresh-policy';
import { createIndexWrites } from '../semantic-index/write-admission';
import { toHit } from './result';
import {
  openDocsSearch,
  searchDocumentation,
  searchDocumentationWithLeftOut,
  type DocsSearch,
} from './search';

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
// Only the frontmatter names tasks; no section does.
writeFileSync(
  join(root, 'docs', 'engine.md'),
  '---\nid: engine\ntype: hub\ntitle: Engine\nstatus: current\nsummary: Tasks are handled by the engine.\nread_when: [changing work items]\n---\n\n# Engine\n\nWork items move through states.\n',
);

writeFileSync(join(root, 'docs', 'docs.yaml'), 'nonAuthoritative: [ideas]\n');

afterAll(() => rmSync(root, { recursive: true, force: true }));

const settings = parseDocsConfig({ search: { semantic: true } });
const corpus = openFileSystemCorpus(root, settings);
// An index held in memory: every write is admitted.
const admitted = () => createIndexWrites(() => Promise.resolve(true), cacheNotIgnoredReason('x'));
const cachedSource = (file: string) =>
  createDocsChunkSource({ corpus, cache: { file, admitWrite: () => Promise.resolve(true) } });

function semanticSearch() {
  const provider = createFakeEmbeddingProvider();
  const store = createInMemoryVectorStore();
  const search: DocsSearch = {
    chunks: createDocsChunkSource({ corpus }),
    vectors: { store, writes: admitted(), providers: { query: provider, documents: provider } },
  };

  return { provider, store, search };
}

const request = {
  query: 'install widget',
  limit: 5,
  includeNonAuthoritative: false,
  snippets: false,
  refresh: true,
};

describe('searchDocumentationWithLeftOut', () => {
  it('counts the non-authoritative documents the same query would add, embedding the query once', async () => {
    const { provider, search } = semanticSearch();
    const source = createDocsChunkSource({ corpus });
    const before = (await source.load()).revision;
    await searchDocumentation(search, request);
    const calls = provider.calls.length;

    const result = await searchDocumentationWithLeftOut(search, request);
    expect(result.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(result.nonAuthoritativeLeftOut).toBe(1);
    expect(provider.calls.slice(calls).map((call) => call.purpose)).toEqual(['query']);
    // Building the vector index does not change the corpus revision.
    expect((await source.load()).revision).toBe(before);

    expect(
      await searchDocumentationWithLeftOut(search, { ...request, includeNonAuthoritative: true }),
    ).toMatchObject({ nonAuthoritativeLeftOut: 0 });
  });

  it('counts on the lexical path too', async () => {
    const search: DocsSearch = {
      chunks: createDocsChunkSource({ corpus }),
      vectors: { reason: { code: 'semantic-disabled', message: 'off' } },
    };
    const result = await searchDocumentationWithLeftOut(search, request);
    expect(result).toMatchObject({ mode: 'lexical', nonAuthoritativeLeftOut: 1 });
  });
});

describe('searchDocumentation', () => {
  it('builds the index on read, answers hybrid and then embeds only the query', async () => {
    const { provider, search } = semanticSearch();
    const first = await searchDocumentation(search, request);
    expect(first.mode).toBe('hybrid');
    expect(first.results.map((hit) => hit.id)).toEqual(['guide']);
    expect(first.results[0]).toEqual({
      id: 'guide',
      title: 'guide title',
      type: 'hub',
      status: 'current',
      file: 'docs/guide.md',
      score: expect.any(Number) as unknown,
      sections: [
        {
          headingPath: ['Guide', 'Install'],
          sectionId: 'guide/install',
          line: 10,
          score: expect.any(Number) as unknown,
        },
      ],
    });

    const embedCalls = provider.calls.length;
    expect(await searchDocumentation(search, request)).toEqual(first);
    expect(provider.calls.slice(embedCalls).map((call) => call.purpose)).toEqual(['query']);

    const withSnippets = await searchDocumentation(search, { ...request, snippets: true });
    expect(withSnippets.results[0]!.sections[0]).toMatchObject({
      headingPath: ['Guide', 'Install'],
      snippet: 'Install the widget with pnpm.',
    });
  });

  it('finds a document by its frontmatter lexically, singular or plural', async () => {
    const search = openDocsSearch({
      index: openDocsIndex(root, corpus, { writable: true }),
      corpus: openFileSystemCorpus(root, DEFAULT_DOCS_SETTINGS),
      configuration: { docs: DEFAULT_DOCS_SETTINGS, embeddings: undefined },
      env: {},
    });
    for (const query of ['tasks', 'task']) {
      const result = await searchDocumentation(search, { ...request, query });
      expect(result.mode).toBe('lexical');
      expect(result.results).toEqual([
        expect.objectContaining({
          id: 'engine',
          summary: 'Tasks are handled by the engine.',
          readWhen: ['changing work items'],
          sections: [],
        }),
      ]);
    }
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
    const loaded = await createDocsChunkSource({ corpus }).load();
    const { chunks: base } = loaded;
    const many = Array.from({ length: 2 * READ_REFRESH_MAX_CHUNKS + 2 }, (_, index) => ({
      ...base[index % base.length]!,
      id: `${base[index % base.length]!.id}/${String(index)}`,
    }));
    const search: DocsSearch = {
      chunks: {
        load: () =>
          Promise.resolve({
            ...loaded,
            chunks: many,
            searchEngine: () => createSearchEngine(many),
          }),
      },
      vectors: { store, writes: admitted(), providers: { query: provider, documents: provider } },
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

  it('turns a query vector of another dimension into a rebuild run by the catch-up', async () => {
    const store = createInMemoryVectorStore();
    // Same model name, no declared dimension: the endpoint now answers 16 instead of 8 dimensions.
    const before = { ...createFakeEmbeddingProvider({ dimensions: 8 }), dimensions: undefined };
    const after = { ...createFakeEmbeddingProvider({ dimensions: 16 }), dimensions: undefined };
    const chunks = createDocsChunkSource({ corpus });
    await refreshIndex({ chunks: (await chunks.load()).chunks, provider: before, store });
    let starts = 0;
    const search: DocsSearch = {
      chunks,
      vectors: {
        store,
        writes: admitted(),
        providers: { query: after, documents: after },
        catchUp: {
          running: () => Promise.resolve(undefined),
          start: () => {
            starts += 1;

            return Promise.resolve('a background rebuild started');
          },
        },
      },
    };

    const result = await searchDocumentation(search, request);
    expect(result).toMatchObject({
      mode: 'lexical',
      reason: {
        code: 'index-building',
        message: expect.stringMatching(/dimensions 8.*16.*a background rebuild started/) as unknown,
      },
    });
    expect(result.results).not.toHaveLength(0);
    expect(starts).toBe(1);
    // The search itself embedded only the query: no slow probe and no document embedding.
    expect(after.calls.map((call) => call.purpose)).toEqual(['query']);
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
      index: openDocsIndex(root, corpus, { writable: true }),
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
      index: openDocsIndex(root, corpus, { writable: true }),
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
  it('writes no index where Git does not ignore it and answers lexically with the cause', async () => {
    const index = await openProjectIndex(
      root,
      corpus,
      { docs: settings, embeddings: endpoint },
      () => Promise.resolve(false),
    );
    const search = openDocsSearch({
      corpus,
      configuration: { docs: settings, embeddings: endpoint },
      env: {},
      createProvider: () => createFakeEmbeddingProvider(),
      index,
    });
    const result = await searchDocumentation(search, request);
    expect(result).toMatchObject({
      mode: 'lexical',
      reason: {
        code: 'index-unavailable',
        message: expect.stringContaining('add `.nevo/local/` to the project') as unknown,
      },
    });
    expect(existsSync(join(root, '.nevo'))).toBe(false);
  });

  it('reuses an index the process already holds instead of opening another store', () => {
    const index = {
      chunks: createDocsChunkSource({ corpus }),
      store: createInMemoryVectorStore(),
      writes: admitted(),
    };
    const search = openDocsSearch({
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

describe('toHit', () => {
  it('shows one section per heading path, the best-ranked part first', () => {
    const part = (id: string, headingPath: string[], score: number) => ({
      chunk: {
        id,
        unitId: 'guide',
        headingPath,
        sectionId: headingPath.join('/').toLowerCase(),
        startLine: headingPath.length,
        text: id,
        embeddingText: id,
        contentHash: id,
        metadata: {},
      },
      score,
    });
    const hit = toHit(
      {
        id: 'guide',
        type: 'hub',
        title: 'Guide',
        status: 'current',
        file: 'docs/guide.md',
        body: '',
      },
      {
        unitId: 'guide',
        metadata: {},
        score: 3,
        chunks: [
          part('a/1', ['Guide', 'A'], 3),
          part('a/2', ['Guide', 'A'], 2),
          part('b', ['Guide', 'B'], 1),
        ],
      },
      0.5,
      undefined,
    );
    expect(hit.sections).toEqual([
      { headingPath: ['Guide', 'A'], sectionId: 'guide/a', line: 2, score: 3 },
      { headingPath: ['Guide', 'B'], sectionId: 'guide/b', line: 2, score: 1 },
    ]);
  });
});

describe('docs chunk source', () => {
  it('embeds what the frontmatter says the document is about, without empty fields', () => {
    expect(
      contextualHeader({
        id: 'guide',
        title: 'Guide',
        summary: 'How to\n  install.',
        scope: 'specflow',
        areas: ['cli', 'docs'],
        tags: [],
        read_when: ['installing', 'configuring'],
      }),
    ).toBe(
      [
        'Title: Guide',
        'ID: guide',
        'Summary: How to install.',
        'Scope: specflow',
        'Areas: cli, docs',
        'Read when: installing; configuring',
      ].join('\n'),
    );
  });

  it('re-chunks only changed content, also when size and mtime stay, across instances', async () => {
    const cacheFile = join(root, 'cache', 'units.json');
    const source = cachedSource(cacheFile);
    const first = await source.load();
    expect(first.reparsed).toBe(4);
    const second = await source.load();
    expect(second.reparsed).toBe(0);
    // An unchanged corpus keeps its chunks and its BM25 engine.
    expect(second.chunks).toBe(first.chunks);
    expect(second.searchEngine()).toBe(first.searchEngine());

    // Same content, new mtime: hashed, not re-chunked.
    const file = join(root, 'docs', 'old.md');
    utimesSync(file, new Date(2001, 1, 1), new Date(2001, 1, 1));
    expect((await source.load()).reparsed).toBe(0);

    // Same size and mtime, other content (a metadata-preserving copy): still detected.
    const { atime, mtime, size } = statSync(file);
    writeFileSync(file, doc('old', 'superseded', '# Old\n\nInstall the widget by HAND.'));
    utimesSync(file, atime, mtime);
    expect(statSync(file).size).toBe(size);
    const third = await source.load();
    expect(third.reparsed).toBe(1);
    expect(third.searchEngine()).not.toBe(first.searchEngine());
    expect((await cachedSource(cacheFile).load()).reparsed).toBe(0);
  });

  it('shares a pending load between concurrent calls and skips a file that vanished', async () => {
    let listings = 0;
    const gone = Object.assign(new Error('gone'), { code: 'ENOENT' });
    const source = createDocsChunkSource({
      corpus: {
        ...corpus,
        repo: {
          ...corpus.repo,
          listMarkdownFiles: async () => {
            listings += 1;

            return [...(await corpus.repo.listMarkdownFiles()), 'docs/gone.md'];
          },
          readMarkdownFileAsync: (file) =>
            file === 'docs/gone.md'
              ? Promise.reject(gone)
              : corpus.repo.readMarkdownFileAsync(file),
        },
      },
    });
    const loads = await Promise.all([source.load(), source.load(), source.load(), source.load()]);
    expect(listings).toBe(2);
    expect(loads[3]).toBe(loads[1]);
    expect(loads[0].documents.map((document) => document.record.file)).not.toContain(
      'docs/gone.md',
    );
  });

  it('treats a cache file of the wrong shape as an empty cache', async () => {
    const cacheFile = join(root, 'cache', 'null.json');
    mkdirSync(join(root, 'cache'), { recursive: true });
    writeFileSync(cacheFile, 'null');
    expect((await cachedSource(cacheFile).load()).reparsed).toBe(4);
  });
});
