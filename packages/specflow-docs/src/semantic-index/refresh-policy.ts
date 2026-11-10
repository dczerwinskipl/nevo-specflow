// The read-time refresh (ADR 0020): how much of the index a search brings up to date before it
// answers. `semantic status` reports `index-building` with the same bound.

import { refreshIndex, type VectorStore } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { EmbeddingProviders } from '../embeddings/embedding-providers';
import { embeddingFailureReason } from '../embeddings/endpoint-reasons';
import type { DocsChunk } from './chunk-source';
import { pendingChunks } from './freshness';
import {
  overLimitReason,
  refreshReason,
  refreshSkippedReason,
  unreadableIndexReason,
} from './reasons';

/**
 * Most chunks a search embeds before answering (the read-time refresh). It is one request at the
 * default batch size, about 10 s on a local CPU model and far less on a hosted API, and covers a
 * typical edit of a few sections. A larger gap (a first build: about 20 minutes on CPU for this
 * repository) is left to `semantic index` or the Runtime start refresh.
 */
export const READ_REFRESH_MAX_CHUNKS = 16;

/** The index a search ranks with, and the providers that embed the query and refresh it. */
export interface IndexVectors {
  readonly store: VectorStore;
  readonly providers: EmbeddingProviders;
}

/**
 * Hybrid ranking needs a vector for every current chunk (ADR 0020: an index that is not complete
 * for the current data answers lexically with `index-building`). The manifest is checked first, so
 * a complete index costs no endpoint call here. Otherwise a small gap is embedded before answering,
 * after a short probe (an unreachable endpoint answers lexically after at most the query timeout);
 * a gap above `READ_REFRESH_MAX_CHUNKS`, or any gap with `refresh` off, is not embedded.
 */
export async function refreshForRead(
  vectors: IndexVectors,
  chunks: readonly DocsChunk[],
  refresh: boolean,
  indexCommand: string,
): Promise<DocsSearchReason | undefined> {
  const { store, providers } = vectors;
  const manifest = await store.readManifest();
  if (manifest.status === 'unreadable') {
    return unreadableIndexReason(manifest.message);
  }

  // Vectors of deleted chunks are never ranked (the engine matches chunk ids and hashes), so an
  // index with only extra vectors is complete; the next full refresh drops them.
  const missing = pendingChunks(
    chunks,
    providers.documents,
    manifest.status === 'ok' ? manifest.manifest : undefined,
  );
  if (missing === 0) {
    return undefined;
  }

  if (!refresh) {
    return refreshSkippedReason(missing, chunks.length, indexCommand);
  }

  if (missing > READ_REFRESH_MAX_CHUNKS) {
    return overLimitReason(missing, READ_REFRESH_MAX_CHUNKS, indexCommand);
  }

  const probe = await providers.query.probe();
  if (!probe.ok) {
    return embeddingFailureReason(probe.failure);
  }

  // The bound holds under the lock too: a re-probe that observes another dimension, or a manifest
  // gone since the read above, turns this into a full rebuild, which the search must not run.
  const outcome = await refreshIndex({
    chunks,
    provider: providers.documents,
    store,
    maxEmbed: READ_REFRESH_MAX_CHUNKS,
  });

  return outcome.status === 'over-limit'
    ? overLimitReason(outcome.pending, READ_REFRESH_MAX_CHUNKS, indexCommand)
    : refreshReason(outcome);
}
