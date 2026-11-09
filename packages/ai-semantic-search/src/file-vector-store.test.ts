import { mkdir, mkdtemp, open, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFileVectorStore } from './file-vector-store';
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
const later = () => Date.now() + 120_000;

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

/** Path of the highest generation's file with `prefix` (`manifest` or `vectors`). */
async function latest(prefix: string): Promise<string> {
  const names = (await readdir(directory)).filter((name) => name.startsWith(`${prefix}-`));
  const generation = (name: string) => Number(name.split('-')[1]);

  return join(directory, names.sort((a, b) => generation(b) - generation(a))[0]!);
}

describe('file vector store', () => {
  it('writes pairs another instance reads while a reader holds the current manifest open', async () => {
    const store = createFileVectorStore({ directory });
    expect(await store.readManifest()).toEqual({ status: 'missing' });

    await write(
      store,
      change(undefined, { reset: true, upsert: [entry('a', [1, 0]), entry('b', [0, 1])] }),
    );
    const reader = await open(await latest('manifest'), 'r');
    try {
      await write(store, change(1, { delete: ['a'], upsert: [entry('c', [1, 1])] }));
      expect(await write(store, change(2, { upsert: [entry('d', [1, 0])] }))).toEqual({
        status: 'applied',
        generation: 3,
      });
    } finally {
      await reader.close();
    }

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

    // The current and the previous pair stay; generation 1 is superseded.
    const files = await readdir(directory);
    expect(files.filter((name) => name.startsWith('manifest-'))).toHaveLength(2);
    expect(files.filter((name) => name.startsWith('vectors-'))).toHaveLength(2);
    expect(files).toHaveLength(4);
  });

  it('keeps readers on a complete pair and removes an abandoned write only once it is stale', async () => {
    const store = createFileVectorStore({ directory });
    await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] }));
    const previous = await latest('vectors');

    // What a writer that died before renaming its manifest leaves behind.
    await writeFile(join(directory, 'vectors-2-dead.f32'), 'partial');
    await writeFile(join(directory, 'manifest-2-dead.json.tmp'), '{"schemaVer');
    expect(await store.query(query)).toMatchObject({ status: 'ok', matches: [{ chunkId: 'b' }] });

    await write(store, change(1, { upsert: [entry('c', [1, 0])] }));
    expect((await stat(previous)).size).toBe(2 * Float32Array.BYTES_PER_ELEMENT);
    expect(await readdir(directory)).toContain('vectors-2-dead.f32');

    await write(createFileVectorStore({ directory, lock: { now: later } }), change(2));
    const files = await readdir(directory);
    expect(files).not.toContain('vectors-2-dead.f32');
    expect(files).not.toContain('manifest-2-dead.json.tmp');
  });

  it('reads a damaged index as missing so a writer resets it, and an unopenable one as unreadable', async () => {
    const store = createFileVectorStore({ directory });
    await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] }));

    await truncate(await latest('vectors'), 3);
    expect(await store.readManifest()).toEqual({ status: 'missing' });
    expect(await store.query(query)).toEqual({ status: 'missing' });
    expect(
      await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] })),
    ).toEqual({
      status: 'applied',
      generation: 2,
    });

    await writeFile(await latest('vectors'), new Uint8Array(Float32Array.of(Number.NaN, 0).buffer));
    expect(await createFileVectorStore({ directory }).query(query)).toEqual({ status: 'missing' });

    await writeFile(await latest('manifest'), '{"schemaVersion":1');
    expect(await store.readManifest()).toEqual({ status: 'missing' });

    await mkdir(join(directory, 'manifest-99-ab.json'));
    expect((await store.readManifest()).status).toBe('unreadable');
    expect((await store.query(query)).status).toBe('unreadable');
    expect(await write(store, change(undefined, { reset: true }))).toMatchObject({
      status: 'write-failed',
    });
  });

  it('lets one writer in at a time and reclaims dead, reused-pid and unrefreshed locks', async () => {
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
    // Not refreshed for longer than the stale bound: a reused pid looks alive but is not the owner.
    const reclaiming = createFileVectorStore({ ...options, lock: { ...options.lock, now: later } });
    await (await openWriter(reclaiming)).close();

    await writeFile(lockPath, JSON.stringify({ pid: deadPid, token: 'dead' }));
    await (await openWriter(store)).close();

    await writeFile(lockPath, JSON.stringify({ pid: process.pid, token: 'before-restart' }));
    await (await openWriter(store)).close();

    await writeFile(lockPath, '');
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });
    await (await openWriter(reclaiming)).close();
    await expect(stat(lockPath)).rejects.toThrow();
  });
});
