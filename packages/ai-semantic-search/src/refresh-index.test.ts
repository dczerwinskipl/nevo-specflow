import { mkdtemp, readFile, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFakeEmbeddingProvider } from './fake-embedding-provider';
import { MANIFEST_FILE, createFileVectorStore } from './file-vector-store';
import { createInMemoryVectorStore } from './in-memory-vector-store';
import { chunkMarkdownUnit } from './markdown-chunker';
import type { SourceUnit } from './ports';
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
    expect(provider.calls).toHaveLength(1);

    const next = corpus([
      unit('locks', '# Locks\nOne writer.\n## Stale\nA dead owner loses the lock.'),
      base[1]!,
      unit('search', '# Search\nHybrid ranking.'),
    ]);
    const changed = next.filter(
      (chunk) => !initial.some((old) => old.contentHash === chunk.contentHash),
    );
    expect(changed.map((chunk) => chunk.id)).toEqual(['locks#Locks > Stale', 'search#Search']);

    expect(await refreshIndex({ chunks: next, provider, store })).toMatchObject({
      status: 'refreshed',
      rebuilt: false,
      embedded: 2,
      deleted: 1,
    });
    expect(provider.calls.slice(1)).toEqual([
      { texts: changed.map((chunk) => chunk.embeddingText), purpose: 'document' },
    ]);
    const manifest = await store.readManifest();
    expect(manifest.status === 'ok' && [...manifest.manifest.chunks.keys()].sort()).toEqual(
      next.map((chunk) => chunk.id).sort(),
    );
  });

  it('rebuilds a file index in full on an identity change and on a truncated vectors file', async () => {
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

      const { vectorsFile } = JSON.parse(await readFile(join(root, MANIFEST_FILE), 'utf8')) as {
        vectorsFile: string;
      };
      await truncate(join(root, vectorsFile), 5);
      expect(await refreshIndex({ chunks, provider: other, store })).toMatchObject({
        status: 'refreshed',
        generation: 1,
        rebuilt: true,
        embedded: chunks.length,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
