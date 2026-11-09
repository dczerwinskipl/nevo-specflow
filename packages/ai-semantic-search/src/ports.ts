/** Filterable metadata a consumer attaches to a unit; the engine never interprets it. */
export type UnitMetadataValue = string | number | boolean | readonly string[];
export type UnitMetadata = Readonly<Record<string, UnitMetadataValue>>;

/**
 * One chunk-able unit of a corpus (for documentation: one document).
 *
 * `text` is the markdown body without any consumer envelope (for example frontmatter). `header` is a
 * short consumer-built context line block (for documentation: title, id, summary, tags) that is
 * embedded with every chunk of the unit so small chunks keep their unit context.
 */
export interface SourceUnit {
  readonly id: string;
  /** Consumer-computed hash of everything the unit's chunks derive from (text and header). */
  readonly contentHash: string;
  readonly text: string;
  readonly header: string;
  readonly metadata: UnitMetadata;
}

/** Enumerates the units of a corpus. The consumer provides it. */
export interface ChunkSource {
  listUnits(): Promise<readonly SourceUnit[]>;
}

/** A searchable piece of a unit produced by the chunker. */
export interface Chunk {
  /** Stable for unchanged content: derived from the unit id and the heading path, not a position. */
  readonly id: string;
  readonly unitId: string;
  readonly headingPath: readonly string[];
  /** The section markdown (heading line included); what lexical ranking and snippets use. */
  readonly text: string;
  /** Unit header, heading path and text: what the embedding provider receives for this chunk. */
  readonly embeddingText: string;
  /** Hash of `embeddingText` and the chunker version; changes exactly when the vector must. */
  readonly contentHash: string;
  readonly metadata: UnitMetadata;
}

export type EmbeddingPurpose = 'document' | 'query';

export type EmbeddingFailureCode =
  'unreachable' | 'timeout' | 'http-status' | 'malformed-response' | 'dimension-mismatch';

export interface EmbeddingFailure {
  readonly code: EmbeddingFailureCode;
  readonly message: string;
  /** HTTP status for `http-status`. */
  readonly status?: number;
}

export type EmbeddingResult =
  | { readonly ok: true; readonly vectors: readonly Float32Array[] }
  | { readonly ok: false; readonly failure: EmbeddingFailure };

export type ProbeResult =
  | { readonly ok: true; readonly latencyMs: number; readonly dimensions: number }
  | { readonly ok: false; readonly latencyMs: number; readonly failure: EmbeddingFailure };

/**
 * Produces embeddings. Failures are returned as typed results, never thrown, so a consumer can
 * degrade to lexical search.
 */
export interface EmbeddingProvider {
  /** Protocol discriminator of the adapter (part of the index identity). */
  readonly protocol: string;
  readonly model: string;
  /** Configured dimensions, when the consumer declared them; every returned vector must match. */
  readonly dimensions: number | undefined;
  /** One vector per text, in input order. The query instruction applies to `query` only. */
  embed(texts: readonly string[], purpose: EmbeddingPurpose): Promise<EmbeddingResult>;
  /** Embeds a fixed short text and reports reachability, latency and the observed dimension. */
  probe(): Promise<ProbeResult>;
}

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

export type ApplyOutcome =
  { readonly status: 'applied'; readonly generation: number } | { readonly status: 'conflict' };

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
}

/**
 * Stores vectors by chunk id. Read methods never throw for store state or I/O problems: they answer
 * `missing` or `unreadable`. `apply` throws only for a change that violates the contract (see
 * `validateChange`) or a failed write; a concurrent writer surfaces as `conflict`.
 */
export interface VectorStore {
  readManifest(): Promise<ManifestOutcome>;
  apply(change: VectorStoreChange): Promise<ApplyOutcome>;
  /** Nearest neighbours by cosine similarity, ordered by score then chunk id. */
  query(query: VectorQuery): Promise<VectorQueryOutcome>;
}
