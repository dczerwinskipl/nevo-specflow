import { describe, expect, it } from 'vitest';

import { createFakeEmbeddingProvider } from './fake-embedding-provider';
import { createInMemoryVectorStore } from './in-memory-vector-store';
import { CHUNKER_VERSION, chunkMarkdownUnit } from './markdown-chunker';
import type { Chunk, IndexIdentity, VectorStore } from './ports';
import { RRF_K } from './rrf';
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
    dimensions: provider.dimensions!,
  };
  await store.apply({
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
      'locks#Locks > Stale',
      'locks#Locks',
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

  it('rejects duplicate chunk ids and invalid limits at the boundary', async () => {
    expect(() => createSearchEngine([chunks[0]!, chunks[0]!])).toThrow(/Duplicate chunk id/);
    await expect(
      engine.search({ query: 'x', limit: 0, vectors: { reason: { code: 'c', message: 'm' } } }),
    ).rejects.toThrow(RangeError);
  });
});

describe('in-memory vector store contract', () => {
  const identity: IndexIdentity = { chunkerVersion: 1, protocol: 'p', model: 'm', dimensions: 2 };
  const entry = (chunkId: string, vector: number[]) => ({
    chunkId,
    contentHash: chunkId,
    vector: Float32Array.from(vector),
  });

  it('upserts, deletes and resets under one identity', async () => {
    const store = createInMemoryVectorStore();
    await store.apply({
      identity,
      reset: true,
      delete: [],
      upsert: [entry('a', [1, 0]), entry('b', [0, 1])],
    });
    await store.apply({ identity, reset: false, delete: ['a'], upsert: [entry('c', [1, 1])] });

    expect([...(await store.readManifest())!.chunks.keys()]).toEqual(['b', 'c']);
    expect((await store.query(Float32Array.of(0, 1), 1)).map((match) => match.chunkId)).toEqual([
      'b',
    ]);
  });

  it('rejects a first change without reset, another identity without reset and wrong dimensions', async () => {
    const store = createInMemoryVectorStore();
    await expect(store.apply({ identity, reset: false, delete: [], upsert: [] })).rejects.toThrow();
    await store.apply({ identity, reset: true, delete: [], upsert: [] });
    await expect(
      store.apply({ identity: { ...identity, model: 'x' }, reset: false, delete: [], upsert: [] }),
    ).rejects.toThrow(/reset/);
    await expect(
      store.apply({ identity, reset: false, delete: [], upsert: [entry('a', [1, 2, 3])] }),
    ).rejects.toThrow(RangeError);
  });
});
