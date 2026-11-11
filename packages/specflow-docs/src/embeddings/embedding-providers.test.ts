import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmbeddingProviders } from './embedding-providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createEmbeddingProviders', () => {
  it('aborts an in-flight request of the default provider when the given signal aborts', async () => {
    let requested!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      requested = resolve;
    });
    // A request that never answers: only its signal can end it.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      requested();

      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const controller = new AbortController();
    const created = createEmbeddingProviders(
      { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
      { env: {}, signal: controller.signal },
    );
    if (!created.ok) {
      throw new Error('providers expected');
    }

    const result = created.providers.documents.embed(['text'], 'document');
    await inFlight;
    controller.abort();

    expect(await result).toMatchObject({ ok: false, failure: { code: 'timeout' } });
  });
});
