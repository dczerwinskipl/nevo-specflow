import { refreshIndex, type EmbeddingProvider } from '@nevo/ai-semantic-search';
import {
  createFakeEmbeddingProvider,
  createInMemoryVectorStore,
  type FakeEmbeddingProvider,
} from '@nevo/ai-semantic-search/testing';
import type { DocsIndexActivity } from '@nevo/specflow-contracts/docs';
import { describe, expect, it } from 'vitest';

import type { DocsChunk } from './chunk-source';
import { cacheNotIgnoredReason } from './reasons';
import {
  endpointFailureReason,
  identityChangedForRead,
  refreshForRead,
  type IndexVectors,
} from './refresh-policy';
import { createIndexWrites } from './write-admission';

const vectors = (activity: DocsIndexActivity): IndexVectors => {
  const provider = createFakeEmbeddingProvider();

  return {
    store: createInMemoryVectorStore(),
    writes: createIndexWrites(() => Promise.resolve(undefined)),
    providers: { query: provider, documents: provider },
    documentsAbortedBy: () => provider,
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

describe('catch-up start', () => {
  it('starts no catch-up when the write admission refuses, and answers the refusal', async () => {
    const refusal = cacheNotIgnoredReason('.nevo/local/cache/docs-index');
    let starts = 0;
    const reason = await identityChangedForRead(
      {
        ...vectors({ state: 'idle' }),
        writes: createIndexWrites(() => Promise.resolve(refusal)),
        catchUp: {
          running: () => Promise.resolve(undefined),
          start: () => {
            starts += 1;

            return Promise.resolve('started');
          },
        },
      },
      'Another dimension.',
      3,
      true,
      'index',
    );
    expect(reason).toEqual(refusal);
    expect(starts).toBe(0);
  });
});

/**
 * A document provider whose embedding waits until `open()` or until its signal aborts, which it
 * answers like the HTTP adapter does: a timeout failure, at once.
 */
function gatedDocuments(inner: FakeEmbeddingProvider) {
  let open!: () => void;
  const gate = new Promise<'open'>((resolve) => (open = () => resolve('open')));
  let reached!: () => void;
  const waiting = new Promise<void>((resolve) => (reached = resolve));
  const documentsAbortedBy = (signal: AbortSignal): EmbeddingProvider => ({
    ...inner,
    probe: () => inner.probe(),
    embed: async (texts, purpose) => {
      reached();
      const aborted = new Promise<'aborted'>((resolve) => {
        if (signal.aborted) {
          resolve('aborted');
        }

        signal.addEventListener('abort', () => resolve('aborted'), { once: true });
      });

      return (await Promise.race([gate, aborted])) === 'aborted'
        ? { ok: false, failure: { code: 'timeout', message: 'aborted' } }
        : inner.embed(texts, purpose);
    },
  });

  return { documentsAbortedBy, open, waiting };
}

const chunks: DocsChunk[] = [1, 2, 3].map((n) => ({
  id: `guide#s${String(n)}`,
  unitId: 'guide',
  headingPath: ['Guide', `Section ${String(n)}`],
  sectionId: `s${String(n)}`,
  startLine: n,
  text: `Section ${String(n)} text`,
  embeddingText: `Guide section ${String(n)} text`,
  contentHash: `hash-${String(n)}`,
  metadata: { file: 'docs/guide.md', title: 'Guide', status: 'current', proposal: false },
}));

describe('read-time refresh with a deadline', () => {
  const setup = () => {
    const provider = createFakeEmbeddingProvider();
    const gated = gatedDocuments(provider);
    const store = createInMemoryVectorStore();
    let starts = 0;
    let activityReads = 0;
    const indexVectors: IndexVectors = {
      store,
      writes: createIndexWrites(() => Promise.resolve(undefined)),
      providers: { query: provider, documents: provider },
      documentsAbortedBy: gated.documentsAbortedBy,
      catchUp: {
        running: () => Promise.resolve(undefined),
        start: () => {
          starts += 1;

          return Promise.resolve('the Runtime started updating it in the background');
        },
      },
      activity: () => {
        activityReads += 1;

        return Promise.resolve(updating);
      },
    };

    return {
      provider,
      gated,
      store,
      indexVectors,
      starts: () => starts,
      activityReads: () => activityReads,
    };
  };

  it('aborts an inline embedding at the deadline, answers index-building and starts the catch-up once without a second probe', async () => {
    const { provider, gated, store, indexVectors, starts, activityReads } = setup();
    const deadline = new AbortController();

    const pending = refreshForRead(indexVectors, chunks, true, 'index', deadline.signal);
    await gated.waiting;
    deadline.abort();
    const reason = await pending;

    expect(reason?.code).toBe('index-building');
    expect(reason?.message).toContain('3 changed chunks');
    expect(reason?.message).toContain('time budget; the Runtime started updating it');
    expect(starts()).toBe(1);
    // The only endpoint call is the probe before the refresh; the abort is no endpoint failure.
    expect(provider.calls).toHaveLength(1);
    expect(activityReads()).toBe(0);
    // Nothing was written and the writer is released: the next refresh takes it and completes.
    expect((await store.readManifest()).status).toBe('missing');
    expect(await refreshIndex({ chunks, provider, store })).toMatchObject({ status: 'refreshed' });
  });

  it('answers no reason when the inline embedding finishes before the deadline', async () => {
    const { gated, store, indexVectors, starts } = setup();
    const deadline = new AbortController();

    const pending = refreshForRead(indexVectors, chunks, true, 'index', deadline.signal);
    await gated.waiting;
    gated.open();

    expect(await pending).toBeUndefined();
    expect(starts()).toBe(0);
    expect(
      await refreshIndex({ chunks, provider: indexVectors.providers.documents, store }),
    ).toMatchObject({
      status: 'current',
    });
  });

  it('names the index command when no catch-up is available', async () => {
    const { gated, indexVectors } = setup();
    const { catchUp: _, ...withoutCatchUp } = indexVectors;
    const deadline = new AbortController();

    const pending = refreshForRead(withoutCatchUp, chunks, true, 'index', deadline.signal);
    await gated.waiting;
    deadline.abort();

    expect(await pending).toMatchObject({
      code: 'index-building',
      message: expect.stringContaining('time budget; run `index`.') as unknown,
    });
  });
});
