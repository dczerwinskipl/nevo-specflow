import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compareIds } from './compare';
import {
  WRITER_LOCK_FILE,
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

/** Manifest file name inside the index directory. */
export const MANIFEST_FILE = 'manifest.json';

const VECTORS_FILE = /^vectors-\d+-[0-9a-f]+\.f32$/;
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

export interface FileVectorStoreOptions {
  /** Index directory chosen by the consumer; created on the first write. Disposable cache. */
  readonly directory: string;
  /** Lock liveness and staleness inputs; defaults use this process and the system clock. */
  readonly lock?: Partial<WriterLockDependencies>;
}

/** One vector per manifest chunk; `offset` is the chunk's vector index in the vectors file. */
interface StoredChunk {
  readonly id: string;
  readonly contentHash: string;
  readonly offset: number;
}

/** The JSON content of `manifest.json`. */
interface StoredManifest {
  readonly schemaVersion: typeof FILE_INDEX_SCHEMA_VERSION;
  readonly generation: number;
  readonly identity: IndexIdentity;
  readonly vectorsFile: string;
  readonly chunks: readonly StoredChunk[];
}

interface Snapshot {
  readonly stored: StoredManifest;
  readonly manifest: IndexManifest;
  readonly candidates: readonly VectorCandidate[];
}

type SnapshotOutcome =
  | { readonly status: 'ok'; readonly snapshot: Snapshot }
  | { readonly status: 'missing' }
  | StoreUnreadable;

/**
 * File-backed `VectorStore` in one consumer-chosen directory, safe to share between processes:
 *
 * - `manifest.json` holds the schema version, the identity, the generation, the name of its vectors
 *   file and, per chunk id, the content hash and vector offset. Each generation's vectors live in
 *   their own `vectors-<generation>-<token>.f32` (native `Float32`, little-endian on every
 *   supported platform), written before the manifest that names it; the manifest is written to a
 *   temporary file and renamed over `manifest.json`. A file is never replaced while it can be
 *   read, so a reader sees one complete pair, and the previous generation's vectors file is kept
 *   for a reader that read the previous manifest.
 * - A missing directory or manifest, and a manifest or vectors file that cannot be parsed, has
 *   another schema version or does not match its counterpart (for example a truncated vectors
 *   file), read as `missing`: the index is disposable and a writer resets it. Other I/O errors
 *   (for example a file locked by another program) read as `unreadable`.
 * - Writes go through the single writer of `writer.lock` (see `tryAcquireWriterLock`); the writer
 *   removes unreferenced vectors and temporary files of earlier writers.
 */
export function createFileVectorStore(options: FileVectorStoreOptions): VectorStore {
  const { directory } = options;
  const lock: WriterLockDependencies = {
    pid: options.lock?.pid ?? process.pid,
    isProcessAlive: options.lock?.isProcessAlive ?? isProcessAlive,
    now: options.lock?.now ?? Date.now,
    unparsableStaleAfterMs: options.lock?.unparsableStaleAfterMs ?? 10_000,
  };

  return {
    async readManifest(): Promise<ManifestOutcome> {
      const outcome = await readSnapshot(directory, false);

      return outcome.status === 'ok'
        ? { status: 'ok', manifest: outcome.snapshot.manifest }
        : outcome;
    },

    async openWriter(): Promise<OpenWriterOutcome> {
      await mkdir(directory, { recursive: true });
      const attempt = await tryAcquireWriterLock(directory, newToken(), lock);
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
            return await applyChange(directory, change);
          } finally {
            applying = false;
          }
        },
        async close() {
          if (!closed) {
            closed = true;
            await attempt.release();
          }
        },
      };

      return { status: 'opened', writer };
    },

    async query({ identity, vector, limit }: VectorQuery): Promise<VectorQueryOutcome> {
      const outcome = await readSnapshot(directory, true);
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

async function applyChange(directory: string, change: VectorStoreChange): Promise<ApplyOutcome> {
  const current = await readSnapshot(directory, true);
  if (current.status === 'unreadable') {
    throw new Error(`The vector index cannot be read before writing: ${current.message}`);
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

  const generation = (base?.manifest.generation ?? 0) + 1;
  const token = newToken();
  const vectorsFile = `vectors-${generation}-${token}.f32`;
  const stored: StoredManifest = {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: change.identity,
    vectorsFile,
    chunks: ordered.map((entry, offset) => ({
      id: entry.chunkId,
      contentHash: entry.contentHash,
      offset,
    })),
  };

  const vectorsPath = join(directory, vectorsFile);
  const tempManifestPath = join(directory, `manifest-${token}.tmp`);
  try {
    await writeFile(vectorsPath, new Uint8Array(data.buffer), { flag: 'wx' });
    await writeFile(tempManifestPath, JSON.stringify(stored), { flag: 'wx' });
    await rename(tempManifestPath, join(directory, MANIFEST_FILE));
  } catch (error) {
    await removeQuietly(tempManifestPath);
    await removeQuietly(vectorsPath);

    throw error;
  }

  await removeLeftovers(directory, new Set([vectorsFile, base?.stored.vectorsFile]));

  return { status: 'applied', generation };
}

async function readSnapshot(
  directory: string,
  withVectors: boolean,
  manifestMovedOn = false,
): Promise<SnapshotOutcome> {
  let text: string;
  try {
    text = await readFile(join(directory, MANIFEST_FILE), 'utf8');
  } catch (error) {
    return absenceOrUnreadable(error);
  }

  const stored = parseManifest(text);
  if (!stored) {
    return { status: 'missing' };
  }

  const vectorsPath = join(directory, stored.vectorsFile);
  let bytes: Uint8Array | undefined;
  let size: number;
  try {
    if (withVectors) {
      bytes = await readFile(vectorsPath);
      size = bytes.byteLength;
    } else {
      size = (await stat(vectorsPath)).size;
    }
  } catch (error) {
    // A writer removes the vectors of older generations; a manifest read just before two newer
    // writes names such a file. Reading again answers from the newer manifest.
    if (errorCode(error) === 'ENOENT' && !manifestMovedOn) {
      return readSnapshot(directory, withVectors, true);
    }

    return absenceOrUnreadable(error);
  }

  const { dimensions } = stored.identity;
  if (size !== stored.chunks.length * dimensions * FLOAT_BYTES) {
    return { status: 'missing' };
  }

  let candidates: VectorCandidate[] = [];
  if (bytes) {
    const vectors = new Float32Array(size / FLOAT_BYTES);
    new Uint8Array(vectors.buffer).set(bytes);
    candidates = stored.chunks.map((chunk) => ({
      chunkId: chunk.id,
      contentHash: chunk.contentHash,
      vector: vectors.subarray(chunk.offset * dimensions, (chunk.offset + 1) * dimensions),
    }));
  }

  const manifest: IndexManifest = {
    identity: stored.identity,
    generation: stored.generation,
    chunks: new Map(stored.chunks.map((chunk) => [chunk.id, chunk.contentHash])),
  };

  return { status: 'ok', snapshot: { stored, manifest, candidates } };
}

function absenceOrUnreadable(error: unknown): SnapshotOutcome {
  const code = errorCode(error);
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return { status: 'missing' };
  }

  return {
    status: 'unreadable',
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Boundary validation of `manifest.json`; anything else than a consistent manifest is absent. */
function parseManifest(text: string): StoredManifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (!isRecord(value) || value.schemaVersion !== FILE_INDEX_SCHEMA_VERSION) {
    return undefined;
  }

  const { generation, identity, vectorsFile, chunks } = value;
  if (
    !isPositiveInteger(generation) ||
    !isIdentity(identity) ||
    typeof vectorsFile !== 'string' ||
    !VECTORS_FILE.test(vectorsFile) ||
    !Array.isArray(chunks)
  ) {
    return undefined;
  }

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
    vectorsFile,
    chunks: chunks as StoredChunk[],
  };
}

function isIdentity(value: unknown): value is IndexIdentity {
  return (
    isRecord(value) &&
    Number.isInteger(value.chunkerVersion) &&
    typeof value.protocol === 'string' &&
    typeof value.model === 'string' &&
    isPositiveInteger(value.dimensions)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/**
 * Removes vectors files no manifest in `keep` names and temporary files of crashed writers. Runs
 * under the writer lock; a file another program holds open stays for the next write to remove.
 */
async function removeLeftovers(
  directory: string,
  keep: ReadonlySet<string | undefined>,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }

  for (const name of names) {
    if (
      name !== WRITER_LOCK_FILE &&
      ((VECTORS_FILE.test(name) && !keep.has(name)) || name.endsWith('.tmp'))
    ) {
      await removeQuietly(join(directory, name));
    }
  }
}

async function removeQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Leftovers are harmless: no manifest names them, and the next write removes them again.
  }
}

function newToken(): string {
  return randomBytes(8).toString('hex');
}
