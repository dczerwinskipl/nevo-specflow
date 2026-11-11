import { describe, expect, it } from 'vitest';

import type { Chunk } from '../chunking/chunk';
import { CHUNKER_VERSION, chunkMarkdownUnit } from '../chunking/markdown-chunker';
import { createFakeEmbeddingProvider } from '../embeddings/fake-embedding-provider';
import { createInMemoryVectorStore } from '../indexing/vector-store/in-memory-vector-store';
import type {
  ApplyOutcome,
  IndexIdentity,
  VectorStore,
  VectorStoreChange,
} from '../indexing/vector-store/vector-store';
import { RRF_K } from '../ranking/rrf';
import { SEARCH_REASON, createSearchEngine } from './search';

const units = [
  {
    id: 'locks',
    text: '# Locks\nA single writer holds the index lock.\n## Stale\nDead owners release the lock.',
  },
  { id: 'rename', text: '# Rename\nAtomic rename replaces the manifest on windows.' },
  { id: 'colors', text: '# Colors\nThe palette uses blue and green.' },
].map((unit) => ({ ...unit, contentHash: unit.id, header: unit.id, metadata: { area: unit.id } }));

const chunks = units.flatMap(chunkMarkdownUnit);

async function write(store: VectorStore, change: VectorStoreChange): Promise<ApplyOutcome> {
  const opened = await store.openWriter();
  if (opened.status !== 'opened') {
    throw new Error('vector store busy');
  }

  try {
    return await opened.writer.apply(change);
  } finally {
    await opened.writer.close();
  }
}

async function indexedStore(
  provider = createFakeEmbeddingProvider(),
  indexed: readonly Chunk[] = chunks,
): Promise<VectorStore> {
  const store = createInMemoryVectorStore();
  const embedded = await provider.embed(
    indexed.map((chunk) => chunk.embeddingText),
    'document',
  );
  if (!embedded.ok) {
    throw new Error('fake embedder failed');
  }

  const identity: IndexIdentity = {
    chunkerVersion: CHUNKER_VERSION,
    protocol: provider.protocol,
    model: provider.model,
    space: provider.space,
    dimensions: provider.dimensions!,
  };
  await write(store, {
    baseGeneration: undefined,
    identity,
    reset: true,
    delete: [],
    upsert: indexed.map((chunk, index) => ({
      chunkId: chunk.id,
      contentHash: chunk.contentHash,
      vector: embedded.vectors[index]!,
    })),
  });

  return store;
}

describe('createSearchEngine', () => {
  const engine = createSearchEngine(chunks);

  it('returns BM25 results grouped by unit with the caller reason when there are no vectors', async () => {
    const reason = { code: 'not-configured', message: 'Semantic search is off.' };
    const result = await engine.search({ query: 'lock', limit: 5, vectors: { reason } });

    expect(result).toMatchObject({ mode: 'lexical', reason });
    expect(result.hits.map((hit) => hit.unitId)).toEqual(['locks']);
    expect(result.hits[0]!.chunks.map((hit) => hit.chunk.id)).toEqual([
      'locks#locks/stale',
      'locks#locks',
    ]);
    expect(result.hits[0]!.score).toBe(result.hits[0]!.chunks[0]!.score);
  });

  it('fuses lexical and vector rankings in hybrid mode, then filters and limits units', async () => {
    const provider = createFakeEmbeddingProvider();
    const vectors = { provider, store: await indexedStore(provider) };

    const all = await engine.search({ query: 'windows lock', limit: 5, vectors });
    expect(all.mode).toBe('hybrid');
    expect(
      all.hits
        .map((hit) => hit.unitId)
        .slice(0, 2)
        .sort(),
    ).toEqual(['locks', 'rename']);
    expect(provider.calls.at(-1)).toEqual({ texts: ['windows lock'], purpose: 'query' });

    const filtered = await engine.search({
      query: 'windows lock',
      limit: 1,
      vectors,
      filter: (chunk) => chunk.metadata.area !== 'locks',
    });
    expect(filtered.hits.map((hit) => hit.unitId)).toEqual(['rename']);

    const again = await engine.search({ query: 'windows lock', limit: 5, vectors });
    expect(again).toEqual(all);
  });

  it('applies the filter before the vector candidate cut', async () => {
    // Twelve rejected units closer to the query than any accepted one would fill all ten vector
    // candidates of a one-unit search if the filter ran after the cut.
    const noise = Array.from({ length: 12 }, (_, index) => ({
      id: `noise-${index}`,
      text: '# Noise\nlock lock lock',
      contentHash: `noise-${index}`,
      header: '',
      metadata: { area: 'noise' },
    })).flatMap(chunkMarkdownUnit);
    const corpus = [...chunks, ...noise];
    const provider = createFakeEmbeddingProvider();
    const store = await indexedStore(provider, corpus);
    const matched: string[] = [];
    const spy: VectorStore = {
      ...store,
      query: async (query) => {
        const outcome = await store.query(query);
        if (outcome.status === 'ok') {
          matched.push(...outcome.matches.map((match) => match.chunkId));
        }

        return outcome;
      },
    };

    const result = await createSearchEngine(corpus).search({
      query: 'lock',
      limit: 1,
      vectors: { provider, store: spy },
      filter: (chunk) => chunk.metadata.area !== 'noise',
    });
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.filter((id) => id.startsWith('noise-'))).toEqual([]);
    expect(result.hits.map((hit) => hit.unitId)).toEqual(['locks']);
  });

  it('ignores stored vectors of removed or changed chunks', async () => {
    const provider = createFakeEmbeddingProvider();
    const stale = chunks.map((chunk) =>
      chunk.unitId === 'colors' ? { ...chunk, contentHash: 'old' } : chunk,
    );
    const vectors = { provider, store: await indexedStore(provider, stale) };

    const result = await engine.search({ query: 'palette', limit: 5, vectors });
    expect(result.mode).toBe('hybrid');
    const colors = result.hits.find((hit) => hit.unitId === 'colors')!;
    // Only the lexical rank contributes: the stale vector is not fused.
    expect(colors.score).toBe(1 / (RRF_K + 1));
  });

  it('detects a missing index, an identity mismatch and a failing query embedding', async () => {
    const provider = createFakeEmbeddingProvider();
    const search = (vectors: { provider: typeof provider; store: VectorStore }) =>
      engine.search({ query: 'lock', limit: 5, vectors });

    const missing = await search({ provider, store: createInMemoryVectorStore() });
    expect(missing).toMatchObject({
      mode: 'lexical',
      reason: { code: SEARCH_REASON.indexMissing },
    });
    expect(missing.hits.map((hit) => hit.unitId)).toEqual(['locks']);

    const otherModel = createFakeEmbeddingProvider({ model: 'other' });
    const mismatch = await search({ provider: otherModel, store: await indexedStore(provider) });
    expect(mismatch).toMatchObject({
      mode: 'lexical',
      reason: { code: SEARCH_REASON.indexMismatch },
    });

    const store = await indexedStore(provider);
    provider.failWith({ code: 'timeout', message: 'slow' });
    const failed = await search({ provider, store });
    expect(failed).toMatchObject({
      mode: 'lexical',
      reason: { code: SEARCH_REASON.queryEmbeddingFailed },
    });
    expect(failed.hits).not.toHaveLength(0);
  });

  it('degrades to lexical when the store cannot be read', async () => {
    const unreadable: VectorStore = {
      readManifest: () => Promise.resolve({ status: 'unreadable', message: 'EBUSY' }),
      openWriter: () => Promise.reject(new Error('read-only')),
      query: () => Promise.resolve({ status: 'unreadable', message: 'EBUSY' }),
    };
    const result = await engine.search({
      query: 'lock',
      limit: 5,
      vectors: { provider: createFakeEmbeddingProvider(), store: unreadable },
    });

    expect(result).toMatchObject({
      mode: 'lexical',
      reason: {
        code: SEARCH_REASON.indexUnreadable,
        message: expect.stringContaining('EBUSY') as unknown,
      },
    });
    expect(result.hits.map((hit) => hit.unitId)).toEqual(['locks']);
  });

  it('rejects duplicate chunk ids and invalid limits at the boundary', async () => {
    expect(() => createSearchEngine([chunks[0]!, chunks[0]!])).toThrow(/Duplicate chunk id/);
    await expect(
      engine.search({ query: 'x', limit: 0, vectors: { reason: { code: 'c', message: 'm' } } }),
    ).rejects.toThrow(RangeError);
  });
});

describe('in-memory vector store contract', () => {
  const identity: IndexIdentity = {
    chunkerVersion: 1,
    protocol: 'p',
    model: 'm',
    space: 's',
    dimensions: 2,
  };
  const entry = (chunkId: string, vector: number[]) => ({
    chunkId,
    contentHash: chunkId,
    vector: Float32Array.from(vector),
  });

  const change = (baseGeneration: number | undefined, rest: Partial<VectorStoreChange> = {}) => ({
    baseGeneration,
    identity,
    reset: false,
    delete: [],
    upsert: [],
    ...rest,
  });

  it('upserts, deletes and resets under one identity, answering from one snapshot', async () => {
    const store = createInMemoryVectorStore();
    expect(
      await write(
        store,
        change(undefined, { reset: true, upsert: [entry('a', [1, 0]), entry('b', [0, 1])] }),
      ),
    ).toEqual({ status: 'applied', generation: 1 });
    await write(store, change(1, { delete: ['a'], upsert: [entry('c', [1, 1])] }));

    const manifest = await store.readManifest();
    expect(manifest.status === 'ok' && [...manifest.manifest.chunks.keys()]).toEqual(['b', 'c']);
    expect(await store.query({ identity, vector: Float32Array.of(0, 1), limit: 1 })).toEqual({
      status: 'ok',
      matches: [{ chunkId: 'b', contentHash: 'b', score: 1 }],
    });
    expect(
      await store.query({
        identity: { ...identity, model: 'x' },
        vector: Float32Array.of(0, 1),
        limit: 1,
      }),
    ).toEqual({ status: 'mismatch', stored: identity });
  });

  it('answers conflict to a change computed from an older generation', async () => {
    const store = createInMemoryVectorStore();
    const held = await store.openWriter();
    expect((await store.openWriter()).status).toBe('busy');
    if (held.status === 'opened') {
      await held.writer.close();
    }

    await write(store, change(undefined, { reset: true }));
    await write(store, change(1, { reset: true, identity: { ...identity, model: 'new' } }));

    expect(await write(store, change(1, { upsert: [entry('a', [1, 0])] }))).toEqual({
      status: 'conflict',
    });
    expect(await write(store, change(undefined, { reset: true }))).toEqual({ status: 'conflict' });
  });

  it('rejects a first change without reset, another identity without reset and wrong dimensions', async () => {
    const store = createInMemoryVectorStore();
    await expect(write(store, change(undefined))).rejects.toThrow();
    await write(store, change(undefined, { reset: true }));
    await expect(
      write(store, change(1, { identity: { ...identity, model: 'x' } })),
    ).rejects.toThrow(/reset/);
    await expect(write(store, change(1, { upsert: [entry('a', [1, 2, 3])] }))).rejects.toThrow(
      RangeError,
    );
  });
});
