import type { IndexIdentity, VectorStoreChange } from './ports';

/**
 * Port contract of `VectorStore.apply`, shared by store implementations: a change without `reset`
 * must keep the stored identity (and the first change to an empty store must reset), every vector
 * must have the identity's dimension, and a chunk is upserted at most once per change.
 */
export function validateChange(change: VectorStoreChange, stored: IndexIdentity | undefined): void {
  if (!change.reset) {
    if (!stored) {
      throw new Error('The first change to an empty vector store must be a reset.');
    }

    if (!sameIdentity(stored, change.identity)) {
      throw new Error('A change with another index identity must reset the vector store.');
    }
  }

  const upserted = new Set<string>();
  for (const entry of change.upsert) {
    if (entry.vector.length !== change.identity.dimensions) {
      throw new RangeError(
        `Vector for ${entry.chunkId} has ${entry.vector.length} dimensions; the index has ${change.identity.dimensions}.`,
      );
    }

    if (upserted.has(entry.chunkId)) {
      throw new Error(`Duplicate upsert of chunk ${entry.chunkId}.`);
    }

    upserted.add(entry.chunkId);
  }
}

export function sameIdentity(a: IndexIdentity, b: IndexIdentity): boolean {
  return (
    a.chunkerVersion === b.chunkerVersion &&
    a.protocol === b.protocol &&
    a.model === b.model &&
    a.dimensions === b.dimensions
  );
}
