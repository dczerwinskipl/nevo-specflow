/** What a set of stored vectors was produced with. Any difference means the vectors are unusable. */
export interface IndexIdentity {
  readonly chunkerVersion: number;
  readonly protocol: string;
  readonly model: string;
  readonly dimensions: number;
}

export interface IndexManifest {
  readonly identity: IndexIdentity;
  /** Increases with every applied change; the compare-and-swap token of `VectorStore.apply`. */
  readonly generation: number;
  /** Chunk id -> content hash of the chunk the stored vector was computed from. */
  readonly chunks: ReadonlyMap<string, string>;
}

export interface VectorEntry {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly vector: Float32Array;
}

/**
 * One write to a vector store, applied as a whole: a reader sees the store either before or after
 * it. `baseGeneration` is the manifest generation the change was computed from (`undefined` for a
 * store that held no index); when the store has moved on, the change is not applied and `apply`
 * answers `conflict`, so the writer re-reads the manifest and recomputes. `reset` discards every
 * stored vector first (a full rebuild, possibly under a new identity); without it, `identity` must
 * equal the stored identity.
 */
export interface VectorStoreChange {
  readonly baseGeneration: number | undefined;
  readonly identity: IndexIdentity;
  readonly reset: boolean;
  readonly upsert: readonly VectorEntry[];
  readonly delete: readonly string[];
}

/**
 * A write the store could not carry out (for example the lock file or index directory cannot be
 * written, or the index cannot be read before writing); nothing was applied.
 */
export interface StoreWriteFailed {
  readonly status: 'write-failed';
  readonly message: string;
}

export type ApplyOutcome =
  | { readonly status: 'applied'; readonly generation: number }
  | { readonly status: 'conflict' }
  | StoreWriteFailed;

/**
 * The single writer of a store. It holds the store's write lock until `close`. `apply` calls must
 * not overlap, and `apply` after `close` violates the contract and throws. `close` does not throw:
 * a lock it could not remove becomes stale and is reclaimed by the next writer.
 */
export interface VectorStoreWriter {
  apply(change: VectorStoreChange): Promise<ApplyOutcome>;
  close(): Promise<void>;
}

/** `busy`: another writer holds the lock; the caller does not wait for it. */
export type OpenWriterOutcome =
  | { readonly status: 'opened'; readonly writer: VectorStoreWriter }
  | { readonly status: 'busy'; readonly message: string }
  | StoreWriteFailed;

/** A store that cannot be read answers this instead of throwing (for example a locked file). */
export interface StoreUnreadable {
  readonly status: 'unreadable';
  readonly message: string;
}

export type ManifestOutcome =
  | { readonly status: 'ok'; readonly manifest: IndexManifest }
  | { readonly status: 'missing' }
  | StoreUnreadable;

export interface VectorMatch {
  readonly chunkId: string;
  /** Content hash stored with the vector, from the same snapshot as the score. */
  readonly contentHash: string;
  /** Cosine similarity in [-1, 1]. */
  readonly score: number;
}

/**
 * Answer of one query, taken from one consistent snapshot of the store. `mismatch` means the stored
 * identity differs from the expected one; the store then compares no vectors.
 */
export type VectorQueryOutcome =
  | { readonly status: 'ok'; readonly matches: readonly VectorMatch[] }
  | { readonly status: 'missing' }
  | { readonly status: 'mismatch'; readonly stored: IndexIdentity }
  | StoreUnreadable;

export interface VectorQuery {
  /** Identity the query vector was produced under; its `dimensions` equal the vector length. */
  readonly identity: IndexIdentity;
  readonly vector: Float32Array;
  readonly limit: number;
  /**
   * Which stored vectors may match, decided before the `limit` cut so excluded vectors take no
   * place among the matches (for example a consumer filter, or vectors of chunks that no longer
   * exist). All without it.
   */
  readonly accept?: (chunkId: string, contentHash: string) => boolean;
}

/**
 * Stores vectors by chunk id. Read methods never throw for store state or I/O problems: they answer
 * `missing` or `unreadable`, and never wait for a writer. Writes go through the one writer
 * `openWriter` hands out at a time. A lock or write I/O failure answers `write-failed`, a change
 * computed from a state the store has left answers `conflict`; only a contract violation (see
 * `validateChange` and `VectorStoreWriter`) throws.
 */
export interface VectorStore {
  readManifest(): Promise<ManifestOutcome>;
  /** Takes the single-writer lock without waiting. */
  openWriter(): Promise<OpenWriterOutcome>;
  /** Nearest neighbours by cosine similarity, ordered by score then chunk id. */
  query(query: VectorQuery): Promise<VectorQueryOutcome>;
}

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
