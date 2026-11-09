import { SEARCH_REASON, type RefreshOutcome } from '@nevo/ai-semantic-search';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DOCS_SETTINGS } from '../config/docs-settings';
import type { EmbeddingsSettings } from '../config/embeddings-settings';
import { refreshReason, searchReason, semanticEndpoint } from './effective-mode';

const embeddings: EmbeddingsSettings = {
  protocol: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'm',
};
const enabled = { ...DEFAULT_DOCS_SETTINGS, search: { semantic: true } };

describe('effective search mode (ADR 0020 table)', () => {
  it('maps the configuration rows', () => {
    expect(semanticEndpoint({ docs: DEFAULT_DOCS_SETTINGS, embeddings })).toMatchObject({
      reason: { code: 'semantic-disabled' },
    });
    expect(semanticEndpoint({ docs: enabled, embeddings: undefined })).toMatchObject({
      reason: { code: 'no-endpoint' },
    });
    expect(semanticEndpoint({ docs: enabled, embeddings })).toEqual({ embeddings });
  });

  it.each<[RefreshOutcome, string | undefined]>([
    [{ status: 'current', generation: 1 }, undefined],
    [{ status: 'refreshed', generation: 2, rebuilt: true, embedded: 3, deleted: 0 }, undefined],
    [{ status: 'busy', message: 'held' }, 'index-building'],
    [
      { status: 'embedding-failed', failure: { code: 'timeout', message: 'slow' } },
      'endpoint-unreachable',
    ],
    [{ status: 'unreadable', message: 'locked' }, 'index-unavailable'],
    [{ status: 'write-failed', message: 'EACCES' }, 'index-unavailable'],
  ])('maps refresh outcome %j to %s', (outcome, code) => {
    expect(refreshReason(outcome)?.code).toBe(code);
  });

  it.each([
    [SEARCH_REASON.queryEmbeddingFailed, 'endpoint-unreachable'],
    [SEARCH_REASON.indexMissing, 'index-building'],
    [SEARCH_REASON.indexMismatch, 'index-building'],
    [SEARCH_REASON.indexUnreadable, 'index-unavailable'],
    ['no-endpoint', 'no-endpoint'],
  ])('maps engine reason %s to %s and keeps its message', (engineCode, code) => {
    expect(searchReason({ code: engineCode, message: 'why' })).toEqual({ code, message: 'why' });
  });
});
