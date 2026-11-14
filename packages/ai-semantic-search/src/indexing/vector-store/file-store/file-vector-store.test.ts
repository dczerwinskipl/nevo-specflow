import { mkdir, mkdtemp, open, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ApplyOutcome,
  IndexIdentity,
  VectorStore,
  VectorStoreChange,
  VectorStoreWriter,
} from '../vector-store';
import {
  createCheckpointedFileVectorStore,
  createFileVectorStore,
  inspectFileStoreWriter,
} from './file-vector-store';
import { compareGenerations, parseGenerationFile } from './generation-files';

const identity: IndexIdentity = {
  chunkerVersion: 1,
  protocol: 'p',
  model: 'm',
  space: 's',
  dimensions: 2,
};
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

/** The generation files of `kind` (`manifest` or `vectors`), highest first. */
async function generationNames(kind: string): Promise<string[]> {
  const files = (await readdir(directory))
    .map((name) => ({ name, file: parseGenerationFile(name) }))
    .filter(({ file }) => file?.kind === kind);

  return files.sort((a, b) => compareGenerations(b.file!, a.file!)).map(({ name }) => name);
}

/** Path of the highest generation's file of `kind`. */
async function latest(kind: string): Promise<string> {
  return join(directory, (await generationNames(kind))[0]!);
}

describe('file vector store', () => {
  it('keeps the recorded probe across changes until a reset without one', async () => {
    const store = createFileVectorStore({ directory });
    const probe = Float32Array.of(0.6, 0.8);
    await write(store, change(undefined, { reset: true, upsert: [entry('a', [1, 0])], probe }));
    await write(store, change(1, { upsert: [entry('b', [0, 1])] }));
    const reread = await createFileVectorStore({ directory }).readManifest();
    expect(reread.status === 'ok' && [...reread.manifest.probe!]).toEqual([...probe]);

    await write(store, change(2, { reset: true, upsert: [entry('a', [1, 0])] }));
    const reset = await createFileVectorStore({ directory }).readManifest();
    expect(reset.status === 'ok' && reset.manifest.probe).toBeUndefined();
  });

  it('reads every entry of the current generation with its manifest', async () => {
    const store = createFileVectorStore({ directory });
    expect(await store.readEntries()).toEqual({ status: 'missing' });

    const probe = Float32Array.of(0.6, 0.8);
    await write(
      store,
      change(undefined, { reset: true, upsert: [entry('a', [1, 0]), entry('b', [0, 1])], probe }),
    );
    await write(store, change(1, { delete: ['a'], upsert: [entry('c', [1, 1])] }));

    const read = await createFileVectorStore({ directory }).readEntries();
    expect(read.status === 'ok' && read.manifest).toMatchObject({ identity, generation: 2 });
    expect(read.status === 'ok' && [...read.manifest.probe!]).toEqual([...probe]);
    expect(
      read.status === 'ok' &&
        read.entries
          .map(({ chunkId, contentHash, vector }) => [chunkId, contentHash, [...vector]])
          .sort(),
    ).toEqual([
      ['b', 'h-b', [0, 1]],
      ['c', 'h-c', [1, 1]],
    ]);
  });

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

    // The current and the previous pair stay; generation 1 is superseded. Of the lock files only
    // the last writer's remain, released.
    expect(await generationNames('manifest')).toHaveLength(2);
    expect(await generationNames('vectors')).toHaveLength(2);
    expect((await readdir(directory)).filter((name) => name.startsWith('writer-')).sort()).toEqual([
      'writer-3.lock',
      'writer-3.released',
    ]);
    expect(await readdir(directory)).toHaveLength(6);
  });

  it('keeps readers on a complete pair and removes an abandoned write only once it is stale', async () => {
    const store = createFileVectorStore({ directory });
    await write(store, change(undefined, { reset: true, upsert: [entry('b', [0, 1])] }));
    const previous = await latest('vectors');

    // What a write in progress leaves before it renames its manifest: of a writer of a later
    // epoch (in progress or dead), and of a former lock holder, whose pair could never rank first.
    await writeFile(join(directory, 'vectors-5-3-dead.f32'), 'partial');
    await writeFile(join(directory, 'manifest-5-3-dead.json.tmp'), '{"schemaVer');
    await writeFile(join(directory, 'vectors-1-7-beef.f32'), 'partial');
    expect(await store.query(query)).toMatchObject({ status: 'ok', matches: [{ chunkId: 'b' }] });

    await write(store, change(1, { upsert: [entry('c', [1, 0])] }));
    expect((await stat(previous)).size).toBe(2 * Float32Array.BYTES_PER_ELEMENT);
    expect(await readdir(directory)).toContain('vectors-5-3-dead.f32');
    expect(await readdir(directory)).not.toContain('vectors-1-7-beef.f32');

    await write(createFileVectorStore({ directory, lock: { now: later } }), change(2));
    const files = await readdir(directory);
    expect(files).not.toContain('vectors-5-3-dead.f32');
    expect(files).not.toContain('manifest-5-3-dead.json.tmp');
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

    await mkdir(join(directory, 'manifest-99-99-ab.json'));
    expect((await store.readManifest()).status).toBe('unreadable');
    expect((await store.query(query)).status).toBe('unreadable');
    expect(await write(store, change(undefined, { reset: true }))).toMatchObject({
      status: 'write-failed',
    });
  });

  it('lets one writer in at a time and takes over dead, reused-pid and unrefreshed locks', async () => {
    const deadPid = 4242;
    const lock = { scope: 'here', isProcessAlive: (pid: number) => pid !== deadPid };
    const options = { directory, lock };
    const store = createFileVectorStore(options);
    const reclaiming = createFileVectorStore({ directory, lock: { ...lock, now: later } });
    const holder = (epoch: number, record: object | string) =>
      writeFile(
        join(directory, `writer-${String(epoch)}.lock`),
        typeof record === 'string' ? record : JSON.stringify(record),
      );

    const writer = await openWriter(store);
    expect(await createFileVectorStore(options).openWriter()).toMatchObject({ status: 'busy' });
    expect(await writer.apply(change(5, { reset: true }))).toEqual({ status: 'conflict' });
    await writer.close();
    await expect(writer.apply(change(undefined, { reset: true }))).rejects.toThrow(/closed/);
    expect(await inspectFileStoreWriter(options)).toEqual({ status: 'free' });

    await holder(10, { pid: 1, token: 'live', scope: 'here' });
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });
    // A pid of another host or PID namespace says nothing: only the heartbeat counts.
    await holder(11, { pid: deadPid, token: 'container', scope: 'elsewhere' });
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });
    // Not refreshed for longer than the stale bound: an alive-looking pid is not the owner.
    await (await openWriter(reclaiming)).close();

    await holder(20, { pid: deadPid, token: 'dead', scope: 'here' });
    await (await openWriter(store)).close();

    await holder(30, { pid: process.pid, token: 'before-restart', scope: 'here' });
    await (await openWriter(store)).close();

    await holder(40, '');
    expect(await store.openWriter()).toMatchObject({ status: 'busy' });
    await (await openWriter(reclaiming)).close();
    expect((await readdir(directory)).sort()).toEqual(['writer-41.lock', 'writer-41.released']);
  });

  it('fences a writer whose lock was taken over: none of its writes becomes the index', async () => {
    let clock = Date.now();
    const now = () => clock;
    let reachedPublish: () => void = () => undefined;
    const atPublish = new Promise<void>((resolve) => {
      reachedPublish = resolve;
    });
    let resume: () => void = () => undefined;
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let pausing = false;
    const checkpoint = async (step: string) => {
      if (step === 'publish' && pausing) {
        reachedPublish();
        await resumed;
      }
    };

    const store = createFileVectorStore({ directory, lock: { now } });
    const written = async () => {
      const outcome = await store.query({ ...query, limit: 3 });

      return outcome.status === 'ok' ? outcome.matches.map((match) => match.chunkId).sort() : [];
    };

    // A writer stops refreshing its lock (a suspended machine, for example) and B takes over.
    const deposed = await openWriter(createFileVectorStore({ directory, lock: { now } }));
    clock += 120_000;
    const owner = await openWriter(createFileVectorStore({ directory, lock: { now } }));
    expect(
      await deposed.apply(change(undefined, { reset: true, upsert: [entry('x', [1, 0])] })),
    ).toEqual({ status: 'conflict' });
    expect(
      await owner.apply(change(undefined, { reset: true, upsert: [entry('b', [0, 1])] })),
    ).toEqual({ status: 'applied', generation: 1 });
    await owner.close();
    await deposed.close();

    // A writer that passed its last ownership check stops right before it publishes, and is
    // taken over meanwhile: its late pair never ranks above the new owner's.
    const late = await openWriter(
      createCheckpointedFileVectorStore({ directory, lock: { now } }, checkpoint),
    );
    pausing = true;
    const publishing = late.apply(change(1, { upsert: [entry('late', [1, 1])] }));
    await atPublish;
    clock += 120_000;
    const next = await openWriter(createFileVectorStore({ directory, lock: { now } }));
    expect(await next.apply(change(1, { upsert: [entry('next', [1, 0])] }))).toEqual({
      status: 'applied',
      generation: 2,
    });
    resume();
    await publishing;
    expect(await written()).toEqual(['b', 'next']);
    expect(await late.apply(change(2, { upsert: [entry('late', [1, 1])] }))).toEqual({
      status: 'conflict',
    });
    expect(await next.apply(change(2, { delete: ['b'] }))).toEqual({
      status: 'applied',
      generation: 3,
    });
    expect(await written()).toEqual(['next']);
    await late.close();
    await next.close();
  });
});
