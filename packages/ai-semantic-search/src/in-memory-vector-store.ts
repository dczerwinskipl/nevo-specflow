import type {
  ApplyOutcome,
  IndexManifest,
  ManifestOutcome,
  VectorQuery,
  VectorQueryOutcome,
  VectorStore,
  VectorStoreChange,
} from './ports';
import { nearestNeighbours, type VectorCandidate } from './vector-math';
import { sameIdentity, validateChange } from './vector-store-contract';

interface Snapshot {
  readonly manifest: IndexManifest;
  readonly vectors: ReadonlyMap<string, VectorCandidate>;
}

/**
 * Reference `VectorStore` that keeps everything in memory. Every change replaces one immutable
 * snapshot, so each read answers from a single consistent state; it enforces the port contract
 * (`validateChange`) and the compare-and-swap on `baseGeneration`.
 */
export function createInMemoryVectorStore(): VectorStore {
  let snapshot: Snapshot | undefined;

  return {
    readManifest(): Promise<ManifestOutcome> {
      return Promise.resolve(
        snapshot ? { status: 'ok', manifest: snapshot.manifest } : { status: 'missing' },
      );
    },

    apply(change: VectorStoreChange): Promise<ApplyOutcome> {
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
      snapshot = { manifest: { identity: change.identity, generation, chunks }, vectors };

      return Promise.resolve({ status: 'applied', generation });
    },

    query({ identity, vector, limit }: VectorQuery): Promise<VectorQueryOutcome> {
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
        matches: nearestNeighbours(vector, current.vectors.values(), limit),
      });
    },
  };
}
