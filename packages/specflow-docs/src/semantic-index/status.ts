// `docs semantic status`: report the configured endpoint and the semantic index. Status is the only
// `docs` operation whose answer turns an unavailable configured semantic mode into a failure; the
// caller decides the exit code from `failed`, separately from the reported mode.

import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { EmbeddingsSettings } from '../embeddings/embeddings-settings';
import { embeddingFailureReason } from '../embeddings/endpoint-reasons';
import { providersFor, type SemanticEnvironment } from './environment';
import { planAgainstIndex, type EndpointIdentity } from './freshness';
import type { DocsIndex } from './index-store';
import { READ_REFRESH_MAX_CHUNKS } from './refresh-policy';
import { overLimitReason, semanticEndpoint, unreadableIndexReason } from './reasons';

export type EndpointReachability =
  | { readonly reachable: true; readonly latencyMs: number; readonly dimensions: number }
  | { readonly reachable: false; readonly message: string };

/**
 * - `missing`: no index yet; `semantic index` builds it (a search only within its embed bound).
 * - `current`: matches the documents.
 * - `stale`: `changed` chunks differ; a search re-embeds them within its embed bound, otherwise
 *   `semantic index` does.
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
  /** Why `search` answers lexically, as `search` reports it; absent when `available`. */
  readonly reason?: DocsSearchReason;
  /**
   * Semantic search is enabled but cannot work until the configuration, endpoint or index is
   * fixed. An index that only needs building (`index-building`) is not a failure.
   */
  readonly failed: boolean;
}

export interface SemanticStatusOptions {
  /** The index build command as the caller's host invokes it, named in `index-building`. */
  readonly semanticIndexCommand?: string;
}

export async function semanticStatus(
  index: DocsIndex,
  configuration: DocsConfiguration,
  environment: SemanticEnvironment,
  options: SemanticStatusOptions = {},
): Promise<SemanticStatus> {
  const enabled = configuration.docs.search.semantic;
  const settings = configuration.embeddings;
  const endpoint = semanticEndpoint(configuration);
  let reason = 'reason' in endpoint ? endpoint.reason : undefined;

  let reachability: EndpointReachability | null = null;
  let observedDimensions: number | undefined;
  let identity: EndpointIdentity | undefined;
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

  const { state: indexState, pending } = await readIndexState(index, identity, observedDimensions);
  if (indexState.state === 'unreadable') {
    reason ??= unreadableIndexReason(indexState.message);
  }

  // The same bound as the search's read-time refresh: a larger gap answers `index-building`.
  if (pending > READ_REFRESH_MAX_CHUNKS) {
    reason ??= overLimitReason(pending, READ_REFRESH_MAX_CHUNKS, options.semanticIndexCommand);
  }

  return {
    enabled,
    endpoint: settings === undefined ? null : publicEndpoint(settings),
    reachability,
    index: indexState,
    available: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
    failed: enabled && reason !== undefined && reason.code !== 'index-building',
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
  identity: EndpointIdentity | undefined,
  observedDimensions: number | undefined,
): Promise<{ readonly state: IndexState; readonly pending: number }> {
  const outcome = await index.store.readManifest();
  if (outcome.status !== 'ok') {
    return outcome.status === 'missing'
      ? {
          state: { state: 'missing' },
          // Without an endpoint the mode is already lexical for that reason.
          pending: identity === undefined ? 0 : index.chunks.load().chunks.length,
        }
      : { state: { state: 'unreadable', message: outcome.message }, pending: 0 };
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
    return { state: { state: 'current', ...summary, changed: 0 }, pending: 0 };
  }

  const plan = planAgainstIndex(
    index.chunks.load().chunks,
    { ...identity, dimensions: identity.dimensions ?? observedDimensions },
    manifest,
  );
  const pending = plan.embed.length;
  if (plan.reset) {
    return { state: { state: 'rebuild', ...summary, changed: pending }, pending };
  }

  const changed = pending + plan.delete.length;

  return { state: { state: changed === 0 ? 'current' : 'stale', ...summary, changed }, pending };
}
