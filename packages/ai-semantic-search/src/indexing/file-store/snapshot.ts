import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { VectorCandidate } from '../../ranking/vector-math';
import type { IndexManifest, StoreUnreadable } from '../vector-store';
import { generationFiles, type GenerationFile } from './generation-files';
import { errorCode, messageOf } from './io-errors';
import { parseManifest, type StoredManifest } from './manifest-file';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

export interface Snapshot {
  readonly key: string;
  readonly manifest: IndexManifest;
  readonly candidates: readonly VectorCandidate[];
}

export type SnapshotOutcome =
  | { readonly status: 'ok'; readonly snapshot: Snapshot }
  | { readonly status: 'missing' }
  | StoreUnreadable;

/** Decoded vectors of the last generation read; files of a generation never change. */
export interface VectorsCache {
  current: { readonly key: string; readonly candidates: readonly VectorCandidate[] } | undefined;
}

/**
 * Reads and validates the highest generation's whole pair; `readManifest`, `query` and writes all
 * apply this one rule, so a damaged pair is `missing` everywhere. A generation already decoded is
 * taken from the cache (its files never change). A writer removes superseded pairs, so a file named
 * by a listing taken just before can be gone; the read then starts once more from a fresh listing.
 */
export async function readSnapshot(
  directory: string,
  cache: VectorsCache,
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
  const cached = cache.current?.key === top.key ? cache.current : undefined;
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
    } else {
      bytes = await readFile(join(directory, `vectors-${top.key}.f32`));
      size = bytes.byteLength;
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
  if (bytes) {
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

function absenceOrUnreadable(error: unknown): SnapshotOutcome {
  const code = errorCode(error);
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return { status: 'missing' };
  }

  return { status: 'unreadable', message: messageOf(error) };
}
