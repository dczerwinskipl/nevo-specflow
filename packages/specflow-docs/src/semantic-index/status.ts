// `docs semantic status`: report the configured endpoint and the semantic index. Status is the only
// `docs` operation whose answer turns an unavailable configured semantic mode into a failure; the
// caller decides the exit code from `failed`, separately from the reported mode.

import type {
  DocsIndexActivity,
  DocsIndexState,
  DocsSearchReason,
  DocsStatus,
} from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { EmbeddingsSettings } from '../embeddings/embeddings-settings';
import { embeddingFailureReason } from '../embeddings/endpoint-reasons';
import { providersFor, type SemanticEnvironment } from './environment';
import { planAgainstIndex, type EndpointIdentity } from './freshness';
import type { DocsIndex } from './index-store';
import { READ_REFRESH_MAX_CHUNKS } from './refresh-policy';
import { readIndexActivity } from './progress';
import {
  catchUpReason,
  overLimitReason,
  SEMANTIC_INDEX_COMMAND,
  semanticEndpoint,
  unreadableIndexReason,
} from './reasons';

/** The `semantic status` report: the `DocsStatus` contract of `GET /api/docs/status`. */
export type SemanticStatus = DocsStatus;

export interface SemanticStatusOptions {
  /** The index build command as the caller's host invokes it, named in `index-building`. */
  readonly semanticIndexCommand?: string;
  /** A search of this host catches a large gap up in the background (`IndexCatchUp`). */
  readonly backgroundCatchUp?: boolean;
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

  let reachability: DocsStatus['reachability'] = null;
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

  const activity: DocsIndexActivity =
    index.directory === undefined ? { state: 'idle' } : await readIndexActivity(index.directory);

  // The same bound as the search's read-time refresh: a larger gap answers `index-building`.
  if (pending > READ_REFRESH_MAX_CHUNKS) {
    reason ??= largeGapReason(pending, activity, options);
  }

  const fields = {
    enabled,
    endpoint: settings === undefined ? null : publicEndpoint(settings),
    reachability,
    index: indexState,
    activity,
    failed: enabled && reason !== undefined && reason.code !== 'index-building',
  };

  return reason === undefined
    ? { mode: 'hybrid', ...fields }
    : { mode: 'lexical', reason, ...fields };
}

function largeGapReason(
  pending: number,
  activity: DocsIndexActivity,
  options: SemanticStatusOptions,
): DocsSearchReason {
  const command = options.semanticIndexCommand ?? SEMANTIC_INDEX_COMMAND;
  if (activity.state === 'updating') {
    const { progress } = activity;

    return catchUpReason(
      pending,
      READ_REFRESH_MAX_CHUNKS,
      `it is being updated in the background${
        progress === undefined
          ? ''
          : ` (${String(progress.embedded)}/${String(progress.total)} chunks)`
      }`,
    );
  }

  return options.backgroundCatchUp === true
    ? catchUpReason(
        pending,
        READ_REFRESH_MAX_CHUNKS,
        `the next search starts updating it in the background, or run \`${command}\``,
      )
    : overLimitReason(pending, READ_REFRESH_MAX_CHUNKS, command);
}

/** The endpoint fields of the `DocsStatus` contract, picked so new settings never leak into it. */
function publicEndpoint({
  protocol,
  baseUrl,
  model,
  dimensions,
  apiKeyEnv,
}: EmbeddingsSettings): DocsStatus['endpoint'] {
  return {
    protocol,
    baseUrl,
    model,
    ...(dimensions === undefined ? {} : { dimensions }),
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
  };
}

async function readIndexState(
  index: DocsIndex,
  identity: EndpointIdentity | undefined,
  observedDimensions: number | undefined,
): Promise<{ readonly state: DocsIndexState; readonly pending: number }> {
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
