// Why a documentation search answers lexically (ADR 0020, "Semantic search is optional and never
// fails a command"). Every condition that prevents vectors maps to one contract reason; these
// functions are the whole mapping, so each row is testable without an endpoint or an index.

import {
  SEARCH_REASON,
  type EmbeddingFailure,
  type RefreshOutcome,
  type SearchReason,
} from '@nevo/ai-semantic-search';
import {
  DOCS_SEARCH_REASON_CODES,
  type DocsSearchReason,
  type DocsSearchReasonCode,
} from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { EmbeddingsSettings } from '../config/embeddings-settings';

function reason(code: DocsSearchReasonCode, message: string): DocsSearchReason {
  return { code, message };
}

/**
 * Configuration rows: semantic search off, or on without an endpoint; otherwise the endpoint to
 * use.
 */
export function semanticEndpoint(
  config: DocsConfiguration,
): { readonly embeddings: EmbeddingsSettings } | { readonly reason: DocsSearchReason } {
  if (!config.docs.search.semantic) {
    return {
      reason: reason(
        'semantic-disabled',
        'Semantic search is not enabled (docs.search.semantic is not true).',
      ),
    };
  }

  if (config.embeddings === undefined) {
    return {
      reason: reason(
        'no-endpoint',
        'Semantic search is enabled but no embedding endpoint is configured (ai.embeddings).',
      ),
    };
  }

  return { embeddings: config.embeddings };
}

/** The API key's environment variable is named in configuration but not set. */
export function missingApiKeyReason(apiKeyEnv: string): DocsSearchReason {
  return reason(
    'endpoint-unreachable',
    `The embedding API key environment variable ${apiKeyEnv} (ai.embeddings.apiKeyEnv) is not set.`,
  );
}

export function embeddingFailureReason(failure: EmbeddingFailure): DocsSearchReason {
  return reason(
    'endpoint-unreachable',
    `The embedding endpoint failed (${failure.code}): ${failure.message}`,
  );
}

/** The product command that builds the index in full, named in `index-building` messages. */
const SEMANTIC_INDEX_COMMAND = 'nevo-specflow docs semantic index';

/** The index lacks vectors for current chunks and this search does not embed them. */
function indexIncompleteReason(message: string): DocsSearchReason {
  return reason('index-building', message);
}

/** More chunks lack vectors than a search embeds (`limit`, when known). */
export function overLimitReason(pending: number, limit?: number): DocsSearchReason {
  return indexIncompleteReason(
    `The index lacks vectors for ${String(pending)} chunks, more than a search embeds${
      limit === undefined ? '' : ` (${String(limit)})`
    }; run \`${SEMANTIC_INDEX_COMMAND}\`.`,
  );
}

/** `--no-refresh` (or `refresh: false`) on an index that lacks vectors for current chunks. */
export function refreshSkippedReason(pending: number, total: number): DocsSearchReason {
  return indexIncompleteReason(
    `The index lacks vectors for ${String(pending)} of ${String(total)} chunks and this search does not refresh it; search without skipping the refresh, or run \`${SEMANTIC_INDEX_COMMAND}\`.`,
  );
}

/** A read-time or explicit refresh; `undefined` when the index is current for the documents. */
export function refreshReason(outcome: RefreshOutcome): DocsSearchReason | undefined {
  switch (outcome.status) {
    case 'current':
    case 'refreshed':
      return undefined;
    case 'over-limit':
      return overLimitReason(outcome.pending);
    case 'busy':
      return reason('index-building', `Another process is updating the index: ${outcome.message}`);
    case 'embedding-failed':
      return embeddingFailureReason(outcome.failure);
    case 'unreadable':
      return reason('index-unavailable', `The index cannot be read: ${outcome.message}`);
    case 'write-failed':
      return reason('index-unavailable', `The index cannot be written: ${outcome.message}`);
  }
}

/** The index could not be read before a refresh. */
export function unreadableIndexReason(message: string): DocsSearchReason {
  return reason('index-unavailable', `The index cannot be read: ${message}`);
}

const ENGINE_REASONS: Readonly<Record<string, DocsSearchReasonCode>> = {
  [SEARCH_REASON.queryEmbeddingFailed]: 'endpoint-unreachable',
  [SEARCH_REASON.indexMissing]: 'index-building',
  [SEARCH_REASON.indexMismatch]: 'index-building',
  [SEARCH_REASON.indexUnreadable]: 'index-unavailable',
};

/**
 * The reason the engine's lexical result carries: either one of ours passed through, or one the
 * engine detected itself (query embedding failed; index missing, built with another model or
 * chunker, or unreadable), which only happens without a successful read-time refresh.
 */
export function searchReason(engine: SearchReason): DocsSearchReason {
  if ((DOCS_SEARCH_REASON_CODES as readonly string[]).includes(engine.code)) {
    return reason(engine.code as DocsSearchReasonCode, engine.message);
  }

  const code = ENGINE_REASONS[engine.code];
  if (code === undefined) {
    throw new Error(`Unmapped search reason: ${engine.code}`);
  }

  return reason(code, engine.message);
}
