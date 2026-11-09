import type { IndexIdentity, IndexManifest, VectorStore, VectorStoreChange } from './ports';
import { nearestNeighbours } from './vector-math';
import { validateChange } from './vector-store-contract';

interface StoredVector {
  readonly contentHash: string;
  readonly vector: Float32Array;
}

/**
 * Reference `VectorStore` that keeps everything in memory. It enforces the port contract that every
 * store implements (see `validateChange`) and applies a change as a whole.
 */
export function createInMemoryVectorStore(): VectorStore {
  let identity: IndexIdentity | undefined;
  let vectors = new Map<string, StoredVector>();

  return {
    readManifest(): Promise<IndexManifest | undefined> {
      if (!identity) {
        return Promise.resolve(undefined);
      }

      const chunks = new Map([...vectors].map(([id, stored]) => [id, stored.contentHash]));

      return Promise.resolve({ identity, chunks });
    },

    apply(change: VectorStoreChange): Promise<void> {
      try {
        validateChange(change, identity);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }

      const next = change.reset ? new Map<string, StoredVector>() : new Map(vectors);
      for (const chunkId of change.delete) {
        next.delete(chunkId);
      }

      for (const entry of change.upsert) {
        next.set(entry.chunkId, {
          contentHash: entry.contentHash,
          vector: Float32Array.from(entry.vector),
        });
      }

      identity = change.identity;
      vectors = next;

      return Promise.resolve();
    },

    query(vector, limit) {
      if (identity && vector.length !== identity.dimensions) {
        return Promise.reject(
          new RangeError(
            `Query vector has ${vector.length} dimensions; the index has ${identity.dimensions}.`,
          ),
        );
      }

      const candidates = [...vectors].map(([chunkId, stored]) => ({
        chunkId,
        vector: stored.vector,
      }));

      return Promise.resolve(nearestNeighbours(vector, candidates, limit));
    },
  };
}
