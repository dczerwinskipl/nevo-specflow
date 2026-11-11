import {
  createFakeEmbeddingProvider,
  createInMemoryVectorStore,
} from '@nevo/ai-semantic-search/testing';
import type { DocsIndexActivity } from '@nevo/specflow-contracts/docs';
import { describe, expect, it } from 'vitest';

import { endpointFailureReason, type IndexVectors } from './refresh-policy';

const vectors = (activity: DocsIndexActivity): IndexVectors => {
  const provider = createFakeEmbeddingProvider();

  return {
    store: createInMemoryVectorStore(),
    providers: { query: provider, documents: provider },
    activity: () => Promise.resolve(activity),
  };
};

const updating: DocsIndexActivity = {
  state: 'updating',
  pid: 1,
  progress: {
    startedAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:01:00.000Z',
    embedded: 3,
    total: 9,
  },
};

describe('endpointFailureReason', () => {
  it('reads a timeout or refused connection during a running refresh as index-building', async () => {
    for (const code of ['timeout', 'unreachable'] as const) {
      const reason = await endpointFailureReason(vectors(updating), { code, message: 'slow' });
      expect(reason.code).toBe('index-building');
      expect(reason.message).toContain('(3/9 chunks)');
    }
  });

  it('keeps other failures, and any failure without a live writer, endpoint-unreachable', async () => {
    const status = { code: 'http-status' as const, message: 'HTTP 500', status: 500 };
    expect((await endpointFailureReason(vectors(updating), status)).code).toBe(
      'endpoint-unreachable',
    );
    // A stale lock reads as no writer (`idle`).
    const timeout = { code: 'timeout' as const, message: 'slow' };
    expect((await endpointFailureReason(vectors({ state: 'idle' }), timeout)).code).toBe(
      'endpoint-unreachable',
    );
  });
});
