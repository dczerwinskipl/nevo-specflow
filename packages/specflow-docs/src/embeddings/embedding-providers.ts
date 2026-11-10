// Embedding providers for one configured endpoint. The API key is read from the named environment
// variable here, when a command needs the endpoint, never from configuration.

import {
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  createOpenAiCompatibleEmbeddingProvider,
  type EmbeddingProvider,
  type OpenAiCompatibleEmbeddingSettings,
} from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { EmbeddingsSettings } from './embeddings-settings';
import { missingApiKeyReason } from './endpoint-reasons';

/**
 * Upper bound for embedding a search query and for the reachability probe before a read-time
 * refresh. A query is one short text, so a healthy endpoint answers well within it; a hanging one
 * must not hold every lexical-fallback search for the full document timeout.
 */
export const QUERY_TIMEOUT_MS = 3000;

/**
 * Builds a provider from resolved settings; the default is the OpenAI-compatible adapter. `signal`,
 * when given, aborts the provider's requests: an aborted request answers a failure at once.
 */
export type CreateEmbeddingProvider = (
  settings: OpenAiCompatibleEmbeddingSettings,
  options: { readonly signal?: AbortSignal },
) => EmbeddingProvider;

const createDefaultProvider: CreateEmbeddingProvider = (settings, { signal }) =>
  createOpenAiCompatibleEmbeddingProvider(
    settings,
    signal === undefined
      ? {}
      : { timeoutSignal: (ms) => AbortSignal.any([AbortSignal.timeout(ms), signal]) },
  );

export interface EmbeddingProviders {
  /** Query embedding and reachability probes; at most `QUERY_TIMEOUT_MS` per request. */
  readonly query: EmbeddingProvider;
  /** Document embedding during a refresh and the status probe; the configured timeout. */
  readonly documents: EmbeddingProvider;
}

export interface EmbeddingProviderEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  /** Stops the providers' requests, for example when a Runtime closes during a refresh. */
  readonly signal?: AbortSignal;
}

export function createEmbeddingProviders(
  settings: EmbeddingsSettings,
  { env, createProvider = createDefaultProvider, signal }: EmbeddingProviderEnvironment,
):
  | { readonly ok: true; readonly providers: EmbeddingProviders }
  | {
      readonly ok: false;
      readonly reason: DocsSearchReason;
    } {
  let apiKey: string | undefined;
  if (settings.apiKeyEnv !== undefined) {
    apiKey = env[settings.apiKeyEnv];
    if (apiKey === undefined || apiKey === '') {
      return { ok: false, reason: missingApiKeyReason(settings.apiKeyEnv) };
    }
  }

  const resolved: OpenAiCompatibleEmbeddingSettings = {
    baseUrl: settings.baseUrl,
    model: settings.model,
    ...(settings.dimensions === undefined ? {} : { dimensions: settings.dimensions }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(settings.queryInstruction === undefined
      ? {}
      : { queryInstruction: settings.queryInstruction }),
    ...(settings.batchSize === undefined ? {} : { batchSize: settings.batchSize }),
  };
  const documentTimeoutMs = settings.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;

  return {
    ok: true,
    providers: {
      query: createProvider(
        { ...resolved, timeoutMs: Math.min(documentTimeoutMs, QUERY_TIMEOUT_MS) },
        { ...(signal === undefined ? {} : { signal }) },
      ),
      documents: createProvider(
        { ...resolved, timeoutMs: documentTimeoutMs },
        { ...(signal === undefined ? {} : { signal }) },
      ),
    },
  };
}
