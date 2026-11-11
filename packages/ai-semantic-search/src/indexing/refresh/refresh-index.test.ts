import { mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SourceUnit } from '../../chunking/chunk';
import { chunkMarkdownUnit } from '../../chunking/markdown-chunker';
import type { EmbeddingProvider } from '../../embeddings/embedding-provider';
import { createFakeEmbeddingProvider } from '../../embeddings/fake-embedding-provider';
import { createFileVectorStore } from '../vector-store/file-store/file-vector-store';
import { createInMemoryVectorStore } from '../vector-store/in-memory-vector-store';
import { refreshIndex } from './refresh-index';

const unit = (id: string, text: string): SourceUnit => ({
  id,
  contentHash: text,
  text,
  header: id,
  metadata: {},
});
const corpus = (units: readonly SourceUnit[]) => units.flatMap(chunkMarkdownUnit);

const base = [
  unit('locks', '# Locks\nOne writer.\n## Stale\nDead owners release it.'),
  unit('rename', '# Rename\nAtomic rename.'),
  unit('colors', '# Colors\nBlue and green.'),
];

describe('refreshIndex', () => {
  it('rebuilds for another embedding space or for changed weights under the same name', async () => {
    const chunks = corpus(base);
    const store = createInMemoryVectorStore();
    const before = createFakeEmbeddingProvider();
    // Without verification nothing is recorded; a verifying refresh records the probe, no re-embed.
    await refreshIndex({ chunks, provider: before, store });
    expect(
      await refreshIndex({ chunks, provider: before, store, verifySpace: true }),
    ).toMatchObject({ status: 'refreshed', rebuilt: false, embedded: 0 });
    expect(await refreshIndex({ chunks, provider: before, store, verifySpace: true })).toEqual({
      status: 'current',
      generation: 2,
    });

    // The same model name and space with other weights: only the verifying refresh notices.
    const retrained = createFakeEmbeddingProvider({ seed: 7 });
    expect(await refreshIndex({ chunks, provider: retrained, store })).toMatchObject({
      status: 'current',
    });
    expect(
      await refreshIndex({ chunks, provider: retrained, store, verifySpace: true }),
    ).toMatchObject({ status: 'refreshed', rebuilt: true, embedded: chunks.length });

    // Another space (for example another server) is another identity: rebuilt by any refresh.
    const moved = createFakeEmbeddingProvider({ seed: 7, space: 'other-server' });
    expect(await refreshIndex({ chunks, provider: moved, store })).toMatchObject({
      status: 'refreshed',
      rebuilt: true,
    });
  });

  it('embeds every chunk once, then only new or changed chunks, and drops removed ones', async () => {
    const provider = createFakeEmbeddingProvider();
    const store = createInMemoryVectorStore();
    const initial = corpus(base);

    expect(await refreshIndex({ chunks: initial, provider, store })).toEqual({
      status: 'refreshed',
      generation: 1,
      rebuilt: true,
      embedded: initial.length,
      deleted: 0,
    });
    expect(await refreshIndex({ chunks: initial, provider, store })).toEqual({
      status: 'current',
      generation: 1,
    });
    // A provider without configured dimensions is probed once to verify the stored dimension.
    const unconfigured = { ...provider, dimensions: undefined };
    expect(await refreshIndex({ chunks: initial, provider: unconfigured, store })).toEqual({
      status: 'current',
      generation: 1,
    });
    expect(provider.calls.map((call) => call.texts)).toEqual([
      initial.map((chunk) => chunk.embeddingText),
      ['probe'],
    ]);

    const next = corpus([
      unit('locks', '# Locks\nOne writer.\n## Stale\nA dead owner loses the lock.'),
      base[1]!,
      unit('search', '# Search\nHybrid ranking.'),
    ]);
    const changed = next.filter(
      (chunk) => !initial.some((old) => old.contentHash === chunk.contentHash),
    );
    expect(changed.map((chunk) => chunk.id)).toEqual(['locks#locks/stale', 'search#search']);

    expect(await refreshIndex({ chunks: next, provider, store })).toMatchObject({
      status: 'refreshed',
      rebuilt: false,
      embedded: 2,
      deleted: 1,
    });
    expect(provider.calls.slice(2)).toEqual([
      { texts: changed.map((chunk) => chunk.embeddingText), purpose: 'document' },
    ]);
    const manifest = await store.readManifest();
    expect(manifest.status === 'ok' && [...manifest.manifest.chunks.keys()].sort()).toEqual(
      next.map((chunk) => chunk.id).sort(),
    );
  });

  it('rebuilds a file index in full on an identity change and on a truncated or non-finite vectors file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-semantic-refresh-'));
    try {
      const store = createFileVectorStore({ directory: root });
      const chunks = corpus(base);
      await refreshIndex({ chunks, provider: createFakeEmbeddingProvider(), store });

      const other = createFakeEmbeddingProvider({ model: 'other' });
      expect(await refreshIndex({ chunks, provider: other, store })).toMatchObject({
        status: 'refreshed',
        generation: 2,
        rebuilt: true,
        embedded: chunks.length,
      });

      const current = (await readdir(root)).find((name) => name.startsWith('vectors-2-'))!;
      await truncate(join(root, current), 5);
      expect(await refreshIndex({ chunks, provider: other, store })).toMatchObject({
        status: 'refreshed',
        generation: 3,
        rebuilt: true,
        embedded: chunks.length,
      });

      const latest = (await readdir(root)).find((name) => name.startsWith('vectors-3-'))!;
      const damaged = new Float32Array(chunks.length * other.dimensions!);
      damaged[0] = Number.NaN;
      await writeFile(join(root, latest), new Uint8Array(damaged.buffer));
      expect(await refreshIndex({ chunks, provider: other, store })).toMatchObject({
        status: 'refreshed',
        generation: 4,
        rebuilt: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies a long refresh in slices, so a failure keeps the slices before it', async () => {
    const provider = createFakeEmbeddingProvider();
    const store = createInMemoryVectorStore();
    const chunks = corpus(base);
    const progress: unknown[] = [];

    // The second slice fails: the first stays applied.
    const failing: EmbeddingProvider = {
      ...provider,
      embed: (texts, purpose) => {
        if (provider.calls.length === 1) {
          provider.failWith({ code: 'timeout', message: 'slow' });
        }

        return provider.embed(texts, purpose);
      },
    };
    expect(await refreshIndex({ chunks, provider: failing, store, commitChunks: 2 })).toMatchObject(
      { status: 'embedding-failed' },
    );
    provider.failWith(undefined);
    const partial = await store.readManifest();
    expect(partial.status === 'ok' && [...partial.manifest.chunks.keys()]).toEqual(
      chunks.slice(0, 2).map((chunk) => chunk.id),
    );

    // The next refresh embeds only the rest, one write per slice.
    expect(
      await refreshIndex({
        chunks,
        provider,
        store,
        commitChunks: 1,
        onProgress: (step) => progress.push(step),
      }),
    ).toEqual({
      status: 'refreshed',
      generation: 3,
      rebuilt: false,
      embedded: chunks.length - 2,
      deleted: 0,
    });
    expect(chunks).toHaveLength(4);
    expect(progress).toEqual([
      { embedded: 0, total: 2 },
      { embedded: 1, total: 2 },
      { embedded: 2, total: 2 },
    ]);
  });

  it('bounds the plan made under the lock and checks every slice against the probed dimension', async () => {
    const provider = createFakeEmbeddingProvider();
    const store = createInMemoryVectorStore();
    const chunks = corpus(base);
    await refreshIndex({ chunks, provider, store });

    // One new chunk looks like a gap of 1, but the provider has no configured dimension and the
    // endpoint now answers 4-dimensional probes: the locked plan is a full rebuild.
    const next = [...chunks, ...corpus([unit('search', '# Search\nHybrid ranking.')])];
    const reprobed: EmbeddingProvider = {
      ...provider,
      dimensions: undefined,
      probe: () => Promise.resolve({ ok: true, latencyMs: 0, dimensions: 4 }),
    };
    expect(await refreshIndex({ chunks: next, provider: reprobed, store, maxEmbed: 1 })).toEqual({
      status: 'over-limit',
      pending: next.length,
    });
    expect(provider.calls).toHaveLength(1);

    // Unbounded, the 32-dimensional vectors no longer match the probed dimension.
    expect(await refreshIndex({ chunks: next, provider: reprobed, store })).toMatchObject({
      status: 'embedding-failed',
      failure: { code: 'dimension-mismatch' },
    });
    const manifest = await store.readManifest();
    expect(manifest.status === 'ok' && manifest.manifest.generation).toBe(1);
  });

  it('rebuilds when the endpoint changes its dimension under the same model name', async () => {
    const store = createInMemoryVectorStore();
    const chunks = corpus(base);
    // Neither endpoint declares its dimension: only a probe tells them apart.
    const before = { ...createFakeEmbeddingProvider({ dimensions: 8 }), dimensions: undefined };
    const after = { ...createFakeEmbeddingProvider({ dimensions: 16 }), dimensions: undefined };
    await refreshIndex({ chunks, provider: before, store });

    expect(await refreshIndex({ chunks, provider: after, store })).toMatchObject({
      status: 'refreshed',
      rebuilt: true,
      embedded: chunks.length,
    });
    const manifest = await store.readManifest();
    expect(manifest.status === 'ok' && manifest.manifest.identity.dimensions).toBe(16);
  });

  it('answers busy without embedding while another writer holds the store, and keeps it on failure', async () => {
    const provider = createFakeEmbeddingProvider();
    const store = createInMemoryVectorStore();
    const chunks = corpus(base);

    const held = await store.openWriter();
    expect(await refreshIndex({ chunks, provider, store })).toMatchObject({ status: 'busy' });
    expect(provider.calls).toHaveLength(0);
    if (held.status === 'opened') {
      await held.writer.close();
    }

    provider.failWith({ code: 'timeout', message: 'slow' });
    expect(await refreshIndex({ chunks, provider, store })).toEqual({
      status: 'embedding-failed',
      failure: { code: 'timeout', message: 'slow' },
    });
    expect(await store.readManifest()).toEqual({ status: 'missing' });
    expect((await store.openWriter()).status).toBe('opened');
  });
});
