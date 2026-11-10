// Why a configured embedding endpoint cannot be used, as contract reasons (ADR 0020). `init` probes
// the endpoint with them; search and the index report them as the reason a search answers lexically.

import type { EmbeddingFailure } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

/** The API key's environment variable is named in configuration but not set. */
export function missingApiKeyReason(apiKeyEnv: string): DocsSearchReason {
  return {
    code: 'endpoint-unreachable',
    message: `The embedding API key environment variable ${apiKeyEnv} (ai.embeddings.apiKeyEnv) is not set.`,
  };
}

export function embeddingFailureReason(failure: EmbeddingFailure): DocsSearchReason {
  return {
    code: 'endpoint-unreachable',
    message: `The embedding endpoint failed (${failure.code}): ${failure.message}`,
  };
}
