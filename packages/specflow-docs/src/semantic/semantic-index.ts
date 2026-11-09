// `docs semantic status` and `docs semantic index`: report and (re)build the semantic index. Status is
// the only `docs` operation whose answer turns an unavailable configured semantic mode into a
// failure; the caller decides the exit code from `available`.

import {
  CHUNKER_VERSION,
  planRefresh,
  refreshIndex,
  type RefreshOutcome,
  type RefreshProgress,
} from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { EmbeddingsSettings } from '../config/embeddings-settings';
import type { DocsIndex } from './docs-index';
import {
  embeddingFailureReason,
  refreshReason,
  semanticEndpoint,
  unreadableIndexReason,
} from './effective-mode';
import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
  type EmbeddingProviders,
} from './embedding-providers';

export interface SemanticEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
}

export type EndpointReachability =
  | { readonly reachable: true; readonly latencyMs: number; readonly dimensions: number }
  | { readonly reachable: false; readonly message: string };

/**
 * - `missing`: no index yet; the next search or `semantic index` builds it.
 * - `current`: matches the documents.
 * - `stale`: `changed` chunks differ; the next search or `semantic index` re-embeds them.
 * - `rebuild`: built with another chunker, protocol, model or dimension; it is rebuilt in full.
 * - `unreadable`: the index cannot be read right now.
 */
export type IndexState =
  | { readonly state: 'missing' }
  | { readonly state: 'unreadable'; readonly message: string }
  | {
      readonly state: 'current' | 'stale' | 'rebuild';
      readonly generation: number;
      readonly chunks: number;
      readonly model: string;
      readonly dimensions: number;
      /** Chunks to embed or delete. */
      readonly changed: number;
    };

export interface SemanticStatus {
  /** `docs.search.semantic`. */
  readonly enabled: boolean;
  /** The configured endpoint; never the API key. */
  readonly endpoint: Omit<EmbeddingsSettings, 'queryInstruction'> | null;
  /** `null` without an endpoint. */
  readonly reachability: EndpointReachability | null;
  readonly index: IndexState;
  /** `search` can answer in hybrid mode (after its read-time refresh). */
  readonly available: boolean;
  /** Why `search` answers lexically; absent when `available`. */
  readonly reason?: DocsSearchReason;
}

type Providers = { readonly providers: EmbeddingProviders } | { readonly reason: DocsSearchReason };

function providersFor(settings: EmbeddingsSettings, environment: SemanticEnvironment): Providers {
  const created = createEmbeddingProviders(settings, environment);

  return created.ok ? { providers: created.providers } : { reason: created.reason };
}

export async function semanticStatus(
  index: DocsIndex,
  configuration: DocsConfiguration,
  environment: SemanticEnvironment,
): Promise<SemanticStatus> {
  const enabled = configuration.docs.search.semantic;
  const settings = configuration.embeddings;
  const endpoint = semanticEndpoint(configuration);
  let reason = 'reason' in endpoint ? endpoint.reason : undefined;

  let reachability: EndpointReachability | null = null;
  let observedDimensions: number | undefined;
  let identity: { protocol: string; model: string; dimensions: number | undefined } | undefined;
  if (settings !== undefined) {
    const resolved = providersFor(settings, environment);
    if ('reason' in resolved) {
      reachability = { reachable: false, message: resolved.reason.message };
      reason ??= resolved.reason;
    } else {
      const { documents } = resolved.providers;
      identity = {
        protocol: documents.protocol,
        model: documents.model,
        dimensions: documents.dimensions,
      };
      const probe = await documents.probe();
      if (probe.ok) {
        reachability = {
          reachable: true,
          latencyMs: probe.latencyMs,
          dimensions: probe.dimensions,
        };
        observedDimensions = probe.dimensions;
      } else {
        const failure = embeddingFailureReason(probe.failure);
        reachability = { reachable: false, message: failure.message };
        reason ??= failure;
      }
    }
  }

  const indexState = await readIndexState(index, identity, observedDimensions);
  if (indexState.state === 'unreadable') {
    reason ??= unreadableIndexReason(indexState.message);
  }

  return {
    enabled,
    endpoint: settings === undefined ? null : publicEndpoint(settings),
    reachability,
    index: indexState,
    available: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
  };
}

function publicEndpoint({
  queryInstruction: _queryInstruction,
  ...endpoint
}: EmbeddingsSettings): Omit<EmbeddingsSettings, 'queryInstruction'> {
  return endpoint;
}

async function readIndexState(
  index: DocsIndex,
  identity: { protocol: string; model: string; dimensions: number | undefined } | undefined,
  observedDimensions: number | undefined,
): Promise<IndexState> {
  const outcome = await index.store.readManifest();
  if (outcome.status !== 'ok') {
    return outcome.status === 'missing'
      ? { state: 'missing' }
      : { state: 'unreadable', message: outcome.message };
  }

  const { manifest } = outcome;
  const stored = manifest.identity;
  const summary = {
    generation: manifest.generation,
    chunks: manifest.chunks.size,
    model: stored.model,
    dimensions: stored.dimensions,
  };
  if (identity === undefined) {
    return { state: 'current', ...summary, changed: 0 };
  }

  const plan = planRefresh(
    index.chunks.load().chunks,
    {
      chunkerVersion: CHUNKER_VERSION,
      protocol: identity.protocol,
      model: identity.model,
      dimensions: identity.dimensions ?? observedDimensions ?? stored.dimensions,
    },
    manifest,
  );
  if (plan.reset) {
    return { state: 'rebuild', ...summary, changed: plan.embed.length };
  }

  const changed = plan.embed.length + plan.delete.length;

  return { state: changed === 0 ? 'current' : 'stale', ...summary, changed };
}

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
