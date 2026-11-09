import { mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MANIFEST_FILE, createFileVectorStore } from './file-vector-store';
import { WRITER_LOCK_FILE } from './file-writer-lock';
import type {
  ApplyOutcome,
  IndexIdentity,
  VectorStore,
  VectorStoreChange,
  VectorStoreWriter,
} from './ports';

const identity: IndexIdentity = { chunkerVersion: 1, protocol: 'p', model: 'm', dimensions: 2 };
const entry = (chunkId: string, vector: number[]) => ({
  chunkId,
  contentHash: `h-${chunkId}`,
  vector: Float32Array.from(vector),
});
const change = (
  baseGeneration: number | undefined,
  rest: Partial<VectorStoreChange> = {},
): VectorStoreChange => ({
  baseGeneration,
  identity,
  reset: false,
  delete: [],
  upsert: [],
  ...rest,
});
const query = { identity, vector: Float32Array.of(0, 1), limit: 1 };

let directory: string;

beforeEach(async () => {
  directory = join(await mkdtemp(join(tmpdir(), 'ai-semantic-index-')), 'index');
});

afterEach(async () => {
  await rm(join(directory, '..'), { recursive: true, force: true });
});

async function openWriter(store: VectorStore): Promise<VectorStoreWriter> {
  const opened = await store.openWriter();
  if (opened.status !== 'opened') {
    throw new Error(opened.message);
  }

  return opened.writer;
}

async function write(store: VectorStore, next: VectorStoreChange): Promise<ApplyOutcome> {
  const writer = await openWriter(store);
  try {
    return await writer.apply(next);
  } finally {
    await writer.close();
  }
}

async function storedVectorsFile(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(directory, MANIFEST_FILE), 'utf8')) as {
    vectorsFile: string;
  };

  return manifest.vectorsFile;
}

describe('file vector store', () => {
  it('writes manifest and vectors pairs another store instance reads, keeping one previous generation', async () => {
    const store = createFileVectorStore({ directory });
    expect(await store.readManifest()).toEqual({ status: 'missing' });

    await write(
      store,
      change(undefined, { reset: true, upsert: [entry('a', [1, 0]), entry('b', [0, 1])] }),
    );
    await write(store, change(1, { delete: ['a'], upsert: [entry('c', [1, 1])] }));
    expect(await write(store, change(2, { upsert: [entry('d', [1, 0])] }))).toEqual({
      status: 'applied',
      generation: 3,
    });

    const other = createFileVectorStore({ directory });
    const manifest = await other.readManifest();
    expect(manifest.status === 'ok' && manifest.manifest.generation).toBe(3);
    expect(manifest.status === 'ok' && [...manifest.manifest.chunks]).toEqual([
      ['b', 'h-b'],
      ['c', 'h-c'],
      ['d', 'h-d'],
    ]);
    expect(await other.query(query)).toEqual({
      status: 'ok',
      matches: [{ chunkId: 'b', contentHash: 'h-b', score: 1 }],
    });
    expect(await other.query({ ...query, identity: { ...identity, model: 'x' } })).toEqual({
      status: 'mismatch',
      stored: identity,
    });

    const files = (await readdir(directory)).sort();
    expect(files.filter((name) => name.endsWith('.f32'))).toHaveLength(2);
    expect(files.filter((name) => !name.endsWith('.f32'))).toEqual([MANIFEST_FILE]);
  });

  it('keeps readers on a complete pair across an interleaved write and an abandoned one', async () => {
    const store = createFileVectorStore({ directory });
    await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] }));
    const readerVectors = await storedVectorsFile();

    // What a writer that died before renaming its manifest leaves behind.
    await writeFile(join(directory, 'vectors-2-dead.f32'), 'partial');
    await writeFile(join(directory, 'manifest-dead.tmp'), '{"schemaVer');
    expect(await store.query(query)).toMatchObject({ status: 'ok', matches: [{ chunkId: 'b' }] });

    // A reader that read the generation 1 manifest still finds its complete vectors file.
    await write(store, change(1, { upsert: [entry('c', [1, 0])] }));
    expect((await stat(join(directory, readerVectors))).size).toBe(
      2 * Float32Array.BYTES_PER_ELEMENT,
    );

    const files = await readdir(directory);
    expect(files).not.toContain('vectors-2-dead.f32');
    expect(files).not.toContain('manifest-dead.tmp');
  });

  it('reads a damaged index as missing so a writer resets it, and an unopenable one as unreadable', async () => {
    const store = createFileVectorStore({ directory });
    await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] }));

    await truncate(join(directory, await storedVectorsFile()), 3);
    expect(await store.readManifest()).toEqual({ status: 'missing' });
    expect(await store.query(query)).toEqual({ status: 'missing' });
    expect(await write(store, change(undefined, { reset: true }))).toEqual({
      status: 'applied',
      generation: 1,
    });

    await writeFile(join(directory, MANIFEST_FILE), '{"schemaVersion":1');
    expect(await store.readManifest()).toEqual({ status: 'missing' });

    await rm(join(directory, MANIFEST_FILE));
    await mkdir(join(directory, MANIFEST_FILE));
    expect((await store.readManifest()).status).toBe('unreadable');
    expect((await store.query(query)).status).toBe('unreadable');
    await expect(write(store, change(undefined, { reset: true }))).rejects.toThrow(
      /cannot be read/,
    );
  });

  it('lets one writer in at a time and reclaims a lock left by a dead or never-started writer', async () => {
    const deadPid = 4242;
    const options = { directory, lock: { isProcessAlive: (pid: number) => pid !== deadPid } };
    const store = createFileVectorStore(options);
    const lockPath = join(directory, WRITER_LOCK_FILE);

    const writer = await openWriter(store);
    expect(await createFileVectorStore(options).openWriter()).toMatchObject({ status: 'busy' });
    expect(await writer.apply(change(5, { reset: true }))).toEqual({ status: 'conflict' });
    await writer.close();
    await expect(writer.apply(change(undefined, { reset: true }))).rejects.toThrow(/closed/);
    await expect(stat(lockPath)).rejects.toThrow();

    await writeFile(lockPath, JSON.stringify({ pid: 1, token: 'live' }));
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });

    await writeFile(lockPath, JSON.stringify({ pid: deadPid, token: 'dead' }));
    await (await openWriter(store)).close();

    await writeFile(lockPath, '');
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });
    const later = createFileVectorStore({ ...options, lock: { now: () => Date.now() + 60_000 } });
    await (await openWriter(later)).close();
    await expect(stat(lockPath)).rejects.toThrow();
  });
});
