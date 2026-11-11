import { nearestNeighbours, type VectorCandidate } from './vector-math';
import {
  probeAfter,
  sameIdentity,
  validateChange,
  type ApplyOutcome,
  type IndexManifest,
  type ManifestOutcome,
  type OpenWriterOutcome,
  type VectorQuery,
  type VectorQueryOutcome,
  type VectorStore,
  type VectorStoreChange,
  type VectorStoreWriter,
} from './vector-store';

interface Snapshot {
  readonly manifest: IndexManifest;
  readonly vectors: ReadonlyMap<string, VectorCandidate>;
}

/**
 * Reference `VectorStore` that keeps everything in memory. Every change replaces one immutable
 * snapshot, so each read answers from a single consistent state; it enforces the port contract
 * (`validateChange`), the single writer and the compare-and-swap on `baseGeneration`.
 */
export function createInMemoryVectorStore(): VectorStore {
  let snapshot: Snapshot | undefined;
  let writerOpen = false;

  const apply = (change: VectorStoreChange): Promise<ApplyOutcome> => {
    if (change.baseGeneration !== snapshot?.manifest.generation) {
      return Promise.resolve({ status: 'conflict' });
    }

    try {
      validateChange(change, snapshot?.manifest.identity);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const vectors = new Map<string, VectorCandidate>(
      change.reset || !snapshot ? [] : snapshot.vectors,
    );
    for (const chunkId of change.delete) {
      vectors.delete(chunkId);
    }

    for (const entry of change.upsert) {
      vectors.set(entry.chunkId, {
        chunkId: entry.chunkId,
        contentHash: entry.contentHash,
        vector: Float32Array.from(entry.vector),
      });
    }

    const generation = (snapshot?.manifest.generation ?? 0) + 1;
    const chunks = new Map(
      [...vectors.values()].map((entry) => [entry.chunkId, entry.contentHash]),
    );
    const probe = probeAfter(change, snapshot?.manifest);
    snapshot = {
      manifest: {
        identity: change.identity,
        generation,
        chunks,
        ...(probe ? { probe: Float32Array.from(probe) } : {}),
      },
      vectors,
    };

    return Promise.resolve({ status: 'applied', generation });
  };

  return {
    readManifest(): Promise<ManifestOutcome> {
      return Promise.resolve(
        snapshot ? { status: 'ok', manifest: snapshot.manifest } : { status: 'missing' },
      );
    },

    openWriter(): Promise<OpenWriterOutcome> {
      if (writerOpen) {
        return Promise.resolve({
          status: 'busy',
          message: 'Another writer holds the vector store.',
        });
      }

      writerOpen = true;
      let closed = false;
      const writer: VectorStoreWriter = {
        apply(change) {
          return closed
            ? Promise.reject(new Error('The vector store writer is closed.'))
            : apply(change);
        },
        close() {
          if (!closed) {
            closed = true;
            writerOpen = false;
          }

          return Promise.resolve();
        },
      };

      return Promise.resolve({ status: 'opened', writer });
    },

    query({ identity, vector, limit, accept }: VectorQuery): Promise<VectorQueryOutcome> {
      const current = snapshot;
      if (!current) {
        return Promise.resolve({ status: 'missing' });
      }

      const stored = current.manifest.identity;
      if (!sameIdentity(stored, identity) || vector.length !== stored.dimensions) {
        return Promise.resolve({ status: 'mismatch', stored });
      }

      return Promise.resolve({
        status: 'ok',
        matches: nearestNeighbours(vector, current.vectors.values(), limit, accept),
      });
    },
  };
}
