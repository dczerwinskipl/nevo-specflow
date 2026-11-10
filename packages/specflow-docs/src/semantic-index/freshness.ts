// How far the index is behind the current chunks for one endpoint identity. A search and
// `semantic status` count pending chunks the same way, so both apply the same embed bound.

import {
  CHUNKER_VERSION,
  planRefresh,
  type Chunk,
  type IndexManifest,
  type RefreshPlan,
} from '@nevo/ai-semantic-search';

/** The embedding identity of the configured endpoint; `dimensions` when declared or observed. */
export interface EndpointIdentity {
  readonly protocol: string;
  readonly model: string;
  readonly dimensions: number | undefined;
}

/**
 * The refresh plan of the current chunks against a stored index. An endpoint without known
 * dimensions is compared with the stored dimensions, so only chunker, protocol or model changes
 * reset it.
 */
export function planAgainstIndex(
  chunks: readonly Chunk[],
  endpoint: EndpointIdentity,
  manifest: IndexManifest,
): RefreshPlan {
  return planRefresh(
    chunks,
    {
      chunkerVersion: CHUNKER_VERSION,
      protocol: endpoint.protocol,
      model: endpoint.model,
      dimensions: endpoint.dimensions ?? manifest.identity.dimensions,
    },
    manifest,
  );
}

/**
 * Chunks without a current vector: every chunk without an index or after a reset (the plan then
 * embeds every chunk), otherwise the new and changed ones. Vectors of deleted chunks are not
 * pending: they are never ranked (the engine matches chunk ids and hashes).
 */
export function pendingChunks(
  chunks: readonly Chunk[],
  endpoint: EndpointIdentity,
  manifest: IndexManifest | undefined,
): number {
  return manifest === undefined
    ? chunks.length
    : planAgainstIndex(chunks, endpoint, manifest).embed.length;
}
