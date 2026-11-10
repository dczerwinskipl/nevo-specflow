// `docs semantic index`: bring the semantic index up to date now.

import { refreshIndex, type RefreshOutcome, type RefreshProgress } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import { providersFor, type SemanticEnvironment } from './environment';
import type { DocsIndex } from './index-store';
import { refreshReason, semanticEndpoint } from './reasons';

/** Result of `semantic index`: the refresh outcome, or why nothing was attempted. */
export type SemanticIndexResult =
  | { readonly status: 'not-attempted'; readonly reason: DocsSearchReason }
  | {
      readonly status: 'done';
      readonly outcome: RefreshOutcome;
      readonly reason?: DocsSearchReason;
    };

/**
 * Bring the index up to date now: embeds new and changed documents, or everything after a mismatch.
 * `onProgress` is called after every store write (the refresh lands in slices).
 */
export async function buildDocsIndex(
  index: DocsIndex,
  configuration: DocsConfiguration,
  environment: SemanticEnvironment,
  onProgress?: (progress: RefreshProgress) => void,
): Promise<SemanticIndexResult> {
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint) {
    return { status: 'not-attempted', reason: endpoint.reason };
  }

  const resolved = providersFor(endpoint.embeddings, environment);
  if ('reason' in resolved) {
    return { status: 'not-attempted', reason: resolved.reason };
  }

  const outcome = await refreshIndex({
    chunks: index.chunks.load().chunks,
    provider: resolved.providers.documents,
    store: index.store,
    ...(onProgress === undefined ? {} : { onProgress }),
  });
  const reason = refreshReason(outcome);

  return { status: 'done', outcome, ...(reason === undefined ? {} : { reason }) };
}
