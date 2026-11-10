// `docs semantic index`: bring the semantic index up to date now.

import { refreshIndex, type RefreshOutcome, type RefreshProgress } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import { providersFor, type SemanticEnvironment } from './environment';
import type { DocsIndex } from './index-store';
import { createProgressRecorder, type ProgressRecorderDependencies } from './progress';
import { refreshReason, semanticEndpoint } from './reasons';

/** Chunks embedded of a refresh's total, reported by `buildDocsIndex`. */
export type IndexProgress = RefreshProgress;

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
 * `onProgress` is called once the plan is made and after every store write (the refresh lands in
 * slices). A refresh that embeds records its progress and outcome in the index directory, where
 * `semantic status` and `GET /api/docs/status` of other processes read it.
 */
export async function buildDocsIndex(
  index: DocsIndex,
  configuration: DocsConfiguration,
  environment: SemanticEnvironment,
  onProgress?: (progress: RefreshProgress) => void,
  recorder: ProgressRecorderDependencies = { pid: process.pid, now: Date.now },
): Promise<SemanticIndexResult> {
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint) {
    return { status: 'not-attempted', reason: endpoint.reason };
  }

  const resolved = providersFor(endpoint.embeddings, environment);
  if ('reason' in resolved) {
    return { status: 'not-attempted', reason: resolved.reason };
  }

  const progress =
    index.directory === undefined ? undefined : createProgressRecorder(index.directory, recorder);
  const outcome = await refreshIndex({
    chunks: index.chunks.load().chunks,
    provider: resolved.providers.documents,
    store: index.store,
    onProgress: (step) => {
      void progress?.update(step);
      onProgress?.(step);
    },
  });
  const reason = refreshReason(outcome);
  await progress?.finish(
    outcome.status === 'refreshed'
      ? { outcome: 'completed', generation: outcome.generation }
      : { outcome: 'failed', message: reason?.message ?? outcome.status },
  );

  return { status: 'done', outcome, ...(reason === undefined ? {} : { reason }) };
}
