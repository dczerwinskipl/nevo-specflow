/** Fixed short text `EmbeddingProvider.probe` embeds. */
export const PROBE_TEXT = 'probe';

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
