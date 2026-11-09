import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compareIds } from './compare';
import {
  errorCode,
  isProcessAlive,
  tryAcquireWriterLock,
  type WriterLockDependencies,
} from './file-writer-lock';
import type {
  ApplyOutcome,
  IndexIdentity,
  IndexManifest,
  ManifestOutcome,
  OpenWriterOutcome,
  StoreUnreadable,
  StoreWriteFailed,
  VectorQuery,
  VectorQueryOutcome,
  VectorStore,
  VectorStoreChange,
  VectorStoreWriter,
} from './ports';
import { nearestNeighbours, type VectorCandidate } from './vector-math';
import { sameIdentity, validateChange } from './vector-store-contract';

/** Version of the on-disk format. Another version is read as `missing`, so the index is rebuilt. */
export const FILE_INDEX_SCHEMA_VERSION = 1;

const GENERATION_FILE = /^(manifest|vectors)-(\d+)-([0-9a-f]+)\.(json|f32)$/;
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

export interface FileVectorStoreOptions {
  /** Index directory chosen by the consumer; created on the first write. Disposable cache. */
  readonly directory: string;
  /**
   * Lock and cleanup inputs; defaults use this process, the system clock and 60 s for
   * `staleAfterMs`, which also bounds how long an abandoned temporary or unreferenced file stays.
   */
  readonly lock?: Partial<WriterLockDependencies>;
}

/** One generation's pair of files: `manifest-<key>.json` and `vectors-<key>.f32`. */
interface GenerationFile {
  readonly generation: number;
  readonly key: string;
}

/** One vector per manifest chunk; `offset` is the chunk's vector index in the vectors file. */
interface StoredChunk {
  readonly id: string;
  readonly contentHash: string;
  readonly offset: number;
}

/** The JSON content of a manifest file. */
interface StoredManifest {
  readonly schemaVersion: typeof FILE_INDEX_SCHEMA_VERSION;
  readonly generation: number;
  readonly identity: IndexIdentity;
  readonly chunks: readonly StoredChunk[];
}

interface Snapshot {
  readonly key: string;
  readonly manifest: IndexManifest;
  readonly candidates: readonly VectorCandidate[];
}

type SnapshotOutcome =
  | { readonly status: 'ok'; readonly snapshot: Snapshot }
  | { readonly status: 'missing' }
  | StoreUnreadable;

/** Decoded vectors of the last generation read; files of a generation never change. */
interface VectorsCache {
  current: { readonly key: string; readonly candidates: readonly VectorCandidate[] } | undefined;
}

/**
 * File-backed `VectorStore` in one consumer-chosen directory, safe to share between processes:
 *
 * - Each generation is a pair named by its generation and a random token: `vectors-<key>.f32`
 *   (native `Float32`, little-endian on every supported platform) and `manifest-<key>.json` (schema
 *   version, identity, generation and, per chunk id, the content hash and vector offset). The
 *   vectors file is written first; the manifest is written to a temporary file and renamed to its
 *   new name. No file is ever written or renamed onto an existing name, so an open reader (or a
 *   virus scanner) never makes a write fail on Windows. Readers take the highest generation.
 * - Files are not fsynced: after a crash or power loss a pair can be incomplete; it then reads as
 *   `missing` and the index is rebuilt.
 * - No manifest, and a highest manifest or vectors file that cannot be parsed, has another schema
 *   version, holds non-finite values or does not match its counterpart (for example a truncated
 *   vectors file), read as `missing`: the index is disposable and a writer resets it. Other I/O
 *   errors (for example a file locked by another program) read as `unreadable`.
 * - Writes go through the single writer of `writer.lock` (see `tryAcquireWriterLock`). After a
 *   write the writer removes pairs superseded by its own, keeping the previous one and whatever the
 *   current highest manifest names; temporary and unreferenced files only once older than
 *   `staleAfterMs`.
 */
export function createFileVectorStore(options: FileVectorStoreOptions): VectorStore {
  const { directory } = options;
  const lock: WriterLockDependencies = {
    pid: options.lock?.pid ?? process.pid,
    isProcessAlive: options.lock?.isProcessAlive ?? isProcessAlive,
    now: options.lock?.now ?? Date.now,
    staleAfterMs: options.lock?.staleAfterMs ?? 60_000,
  };
  const cache: VectorsCache = { current: undefined };

  return {
    async readManifest(): Promise<ManifestOutcome> {
      const outcome = await readSnapshot(directory, undefined);

      return outcome.status === 'ok'
        ? { status: 'ok', manifest: outcome.snapshot.manifest }
        : outcome;
    },

    async openWriter(): Promise<OpenWriterOutcome> {
      let attempt: Awaited<ReturnType<typeof tryAcquireWriterLock>>;
      try {
        await mkdir(directory, { recursive: true });
        attempt = await tryAcquireWriterLock(directory, newToken(), lock);
      } catch (error) {
        return writeFailed('The index lock cannot be taken', error);
      }

      if (attempt.status === 'busy') {
        return attempt;
      }

      let closed = false;
      let applying = false;
      const writer: VectorStoreWriter = {
        async apply(change) {
          if (closed) {
            throw new Error('The vector store writer is closed.');
          }

          if (applying) {
            throw new Error('Changes of one vector store writer must not overlap.');
          }

          applying = true;
          try {
            return await applyChange(directory, change, cache, lock);
          } finally {
            applying = false;
          }
        },
        async close() {
          if (!closed) {
            closed = true;
            // A lock that cannot be removed stops being refreshed and becomes stale.
            await attempt.release().catch(() => undefined);
          }
        },
      };

      return { status: 'opened', writer };
    },

    async query({ identity, vector, limit }: VectorQuery): Promise<VectorQueryOutcome> {
      const outcome = await readSnapshot(directory, cache);
      if (outcome.status !== 'ok') {
        return outcome;
      }

      const stored = outcome.snapshot.manifest.identity;
      if (!sameIdentity(stored, identity) || vector.length !== stored.dimensions) {
        return { status: 'mismatch', stored };
      }

      return {
        status: 'ok',
        matches: nearestNeighbours(vector, outcome.snapshot.candidates, limit),
      };
    },
  };
}

async function applyChange(
  directory: string,
  change: VectorStoreChange,
  cache: VectorsCache,
  lock: WriterLockDependencies,
): Promise<ApplyOutcome> {
  const current = await readSnapshot(directory, cache);
  if (current.status === 'unreadable') {
    return { status: 'write-failed', message: `The index cannot be read: ${current.message}` };
  }

  const base = current.status === 'ok' ? current.snapshot : undefined;
  if (change.baseGeneration !== base?.manifest.generation) {
    return { status: 'conflict' };
  }

  validateChange(change, base?.manifest.identity);

  const entries = new Map<string, VectorCandidate>(
    change.reset || !base ? [] : base.candidates.map((entry) => [entry.chunkId, entry]),
  );
  for (const chunkId of change.delete) {
    entries.delete(chunkId);
  }

  for (const entry of change.upsert) {
    entries.set(entry.chunkId, entry);
  }

  const ordered = [...entries.values()].sort((a, b) => compareIds(a.chunkId, b.chunkId));
  const { dimensions } = change.identity;
  const data = new Float32Array(ordered.length * dimensions);
  ordered.forEach((entry, offset) => data.set(entry.vector, offset * dimensions));

  let generation: number;
  try {
    // Above every manifest on disk, damaged ones included, so the new pair is the highest.
    const highest = generationFiles(await readdir(directory))[0]?.generation ?? 0;
    generation = Math.max(highest, base?.manifest.generation ?? 0) + 1;
  } catch (error) {
    return writeFailed('The index directory cannot be listed', error);
  }

  const key = `${generation}-${newToken()}`;
  const stored: StoredManifest = {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: change.identity,
    chunks: ordered.map((entry, offset) => ({
      id: entry.chunkId,
      contentHash: entry.contentHash,
      offset,
    })),
  };

  const vectorsPath = join(directory, `vectors-${key}.f32`);
  const manifestPath = join(directory, `manifest-${key}.json`);
  const tempManifestPath = `${manifestPath}.tmp`;
  try {
    await writeFile(vectorsPath, new Uint8Array(data.buffer), { flag: 'wx' });
    await writeFile(tempManifestPath, JSON.stringify(stored), { flag: 'wx' });
    await rename(tempManifestPath, manifestPath);
  } catch (error) {
    await removeQuietly(tempManifestPath);
    await removeQuietly(vectorsPath);

    return writeFailed('The index cannot be written', error);
  }

  await removeSuperseded(directory, { generation, key }, base?.key, lock);

  return { status: 'applied', generation };
}

/**
 * Reads the highest generation. A writer removes superseded pairs, so a file named by a listing
 * taken just before can be gone; the read then starts once more from a fresh listing.
 */
async function readSnapshot(
  directory: string,
  cache: VectorsCache | undefined,
  retried = false,
): Promise<SnapshotOutcome> {
  let top: GenerationFile | undefined;
  try {
    top = generationFiles(await readdir(directory))[0];
  } catch (error) {
    return absenceOrUnreadable(error);
  }

  if (!top) {
    return { status: 'missing' };
  }

  let stored: StoredManifest | undefined;
  let size: number;
  let bytes: Uint8Array | undefined;
  const cached = cache?.current?.key === top.key ? cache.current : undefined;
  try {
    stored = parseManifest(
      await readFile(join(directory, `manifest-${top.key}.json`), 'utf8'),
      top.generation,
    );
    if (!stored) {
      return { status: 'missing' };
    }

    if (cached) {
      size = stored.chunks.length * stored.identity.dimensions * FLOAT_BYTES;
    } else if (cache) {
      bytes = await readFile(join(directory, `vectors-${top.key}.f32`));
      size = bytes.byteLength;
    } else {
      size = (await stat(join(directory, `vectors-${top.key}.f32`))).size;
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT' && !retried) {
      return readSnapshot(directory, cache, true);
    }

    return absenceOrUnreadable(error);
  }

  const { dimensions } = stored.identity;
  if (size !== stored.chunks.length * dimensions * FLOAT_BYTES) {
    return { status: 'missing' };
  }

  let candidates = cached?.candidates ?? [];
  if (bytes && cache) {
    const vectors = decodeVectors(bytes);
    if (!vectors) {
      return { status: 'missing' };
    }

    candidates = stored.chunks.map((chunk) => ({
      chunkId: chunk.id,
      contentHash: chunk.contentHash,
      vector: vectors.subarray(chunk.offset * dimensions, (chunk.offset + 1) * dimensions),
    }));
    cache.current = { key: top.key, candidates };
  }

  const manifest: IndexManifest = {
    identity: stored.identity,
    generation: stored.generation,
    chunks: new Map(stored.chunks.map((chunk) => [chunk.id, chunk.contentHash])),
  };

  return { status: 'ok', snapshot: { key: top.key, manifest, candidates } };
}

/** A view of the file bytes when aligned (one copy otherwise); `undefined` for non-finite values. */
function decodeVectors(bytes: Uint8Array): Float32Array | undefined {
  let vectors: Float32Array;
  if (bytes.byteOffset % FLOAT_BYTES === 0) {
    vectors = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / FLOAT_BYTES);
  } else {
    vectors = new Float32Array(bytes.byteLength / FLOAT_BYTES);
    new Uint8Array(vectors.buffer).set(bytes);
  }

  for (const value of vectors) {
    if (!Number.isFinite(value)) {
      return undefined;
    }
  }

  return vectors;
}

/** Manifest files of a listing, highest generation first (then highest key). */
function generationFiles(names: readonly string[]): GenerationFile[] {
  return names
    .map((name) => GENERATION_FILE.exec(name))
    .filter((match) => match?.[1] === 'manifest' && match[4] === 'json')
    .map((match) => ({ generation: Number(match![2]), key: `${match![2]}-${match![3]}` }))
    .sort((a, b) => b.generation - a.generation || compareIds(b.key, a.key));
}

function absenceOrUnreadable(error: unknown): SnapshotOutcome {
  const code = errorCode(error);
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return { status: 'missing' };
  }

  return { status: 'unreadable', message: messageOf(error) };
}

function writeFailed(context: string, error: unknown): StoreWriteFailed {
  return { status: 'write-failed', message: `${context}: ${messageOf(error)}` };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Boundary validation of a manifest file; anything else than a consistent manifest is absent. */
function parseManifest(text: string, generation: number): StoredManifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== FILE_INDEX_SCHEMA_VERSION ||
    value.generation !== generation ||
    !isIdentity(value.identity) ||
    !Array.isArray(value.chunks)
  ) {
    return undefined;
  }

  const { identity, chunks } = value;
  const ids = new Set<string>();
  const offsets = new Set<number>();
  for (const chunk of chunks as unknown[]) {
    if (
      !isRecord(chunk) ||
      typeof chunk.id !== 'string' ||
      typeof chunk.contentHash !== 'string' ||
      !Number.isInteger(chunk.offset) ||
      (chunk.offset as number) < 0 ||
      (chunk.offset as number) >= chunks.length ||
      ids.has(chunk.id) ||
      offsets.has(chunk.offset as number)
    ) {
      return undefined;
    }

    ids.add(chunk.id);
    offsets.add(chunk.offset as number);
  }

  return {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: {
      chunkerVersion: identity.chunkerVersion,
      protocol: identity.protocol,
      model: identity.model,
      dimensions: identity.dimensions,
    },
    chunks: chunks as StoredChunk[],
  };
}

function isIdentity(value: unknown): value is IndexIdentity {
  return (
    isRecord(value) &&
    Number.isInteger(value.chunkerVersion) &&
    typeof value.protocol === 'string' &&
    typeof value.model === 'string' &&
    Number.isInteger(value.dimensions) &&
    (value.dimensions as number) > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Cleanup after a write. Kept: the pair just written, the previous pair (`baseKey`, for readers that
 * listed before the write) and the pair the current highest manifest names (re-listed now, in case
 * another writer wrote after this one). Removed: other pairs of a lower generation, which this
 * write supersedes; any other generation file and temporary file only once older than
 * `staleAfterMs`, because a younger one can belong to a write in progress. A file that cannot be
 * removed (for example held open by another program) stays for a later write.
 */
async function removeSuperseded(
  directory: string,
  written: GenerationFile,
  baseKey: string | undefined,
  lock: WriterLockDependencies,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }

  const keep = new Set([written.key, baseKey, generationFiles(names)[0]?.key]);
  for (const name of names) {
    const match = GENERATION_FILE.exec(name);
    const path = join(directory, name);
    if (match) {
      const key = `${match[2]}-${match[3]}`;
      if (keep.has(key)) {
        continue;
      }

      if (Number(match[2]) < written.generation || (await isOlderThanStale(path, lock))) {
        await removeQuietly(path);
      }
    } else if (name.endsWith('.tmp') && (await isOlderThanStale(path, lock))) {
      await removeQuietly(path);
    }
  }
}

async function isOlderThanStale(path: string, lock: WriterLockDependencies): Promise<boolean> {
  try {
    return lock.now() - (await stat(path)).mtimeMs > lock.staleAfterMs;
  } catch {
    return false;
  }
}

async function removeQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // The file stays for a later write's cleanup; no manifest that readers pick names it.
  }
}

function newToken(): string {
  return randomBytes(8).toString('hex');
}
