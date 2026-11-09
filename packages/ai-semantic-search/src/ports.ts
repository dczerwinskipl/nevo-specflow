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
  /** Chunk id -> content hash of the chunk the stored vector was computed from. */
  readonly chunks: ReadonlyMap<string, string>;
}

export interface VectorEntry {
  readonly chunkId: string;
  readonly contentHash: string;
  readonly vector: Float32Array;
}

/**
 * One write to a vector store. It is applied as a whole: a reader sees the store either before or
 * after it. `reset` discards every stored vector first (a full rebuild under a new identity); without
 * it, `identity` must equal the stored identity.
 */
export interface VectorStoreChange {
  readonly identity: IndexIdentity;
  readonly reset: boolean;
  readonly upsert: readonly VectorEntry[];
  readonly delete: readonly string[];
}

export interface VectorMatch {
  readonly chunkId: string;
  /** Cosine similarity in [-1, 1]. */
  readonly score: number;
}

export interface VectorStore {
  /** `undefined` when the store holds no index yet. */
  readManifest(): Promise<IndexManifest | undefined>;
  apply(change: VectorStoreChange): Promise<void>;
  /** Nearest neighbours by cosine similarity, ordered by score then chunk id. */
  query(vector: Float32Array, limit: number): Promise<readonly VectorMatch[]>;
}
