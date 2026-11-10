import { mkdir } from 'node:fs/promises';

import { nearestNeighbours } from '../../ranking/vector-math';
import {
  sameIdentity,
  type ManifestOutcome,
  type OpenWriterOutcome,
  type VectorQuery,
  type VectorQueryOutcome,
  type VectorStore,
  type VectorStoreWriter,
} from '../vector-store';
import { applyChange } from './apply-change';
import { newToken } from './generation-files';
import { writeFailed } from './io-errors';
import { readSnapshot, type VectorsCache } from './snapshot';
import { isProcessAlive, tryAcquireWriterLock, type WriterLockDependencies } from './writer-lock';

export interface FileVectorStoreOptions {
  /** Index directory chosen by the consumer; created on the first write. Disposable cache. */
  readonly directory: string;
  /**
   * Lock and cleanup inputs; defaults use this process, the system clock and 60 s for
   * `staleAfterMs`, which also bounds how long an abandoned temporary or unreferenced file stays.
   */
  readonly lock?: Partial<WriterLockDependencies>;
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
      const outcome = await readSnapshot(directory, cache);

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
