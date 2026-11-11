// What `semantic status` and `semantic index` need to reach the configured embedding endpoint.

import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import {
  createEmbeddingProviders,
  type CreateEmbeddingProvider,
  type EmbeddingProviders,
} from '../embeddings/embedding-providers';
import type { EmbeddingsSettings } from '../embeddings/embeddings-settings';

export interface SemanticEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  /** Stops the endpoint requests; `semantic index` then ends with the embedding failure. */
  readonly signal?: AbortSignal;
}

export type Providers =
  { readonly providers: EmbeddingProviders } | { readonly reason: DocsSearchReason };

export function providersFor(
  settings: EmbeddingsSettings,
  environment: SemanticEnvironment,
): Providers {
  const created = createEmbeddingProviders(settings, environment);

  return created.ok ? { providers: created.providers } : { reason: created.reason };
}
