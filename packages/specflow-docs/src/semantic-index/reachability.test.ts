import type { EmbeddingProvider, ProbeResult } from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { describe, expect, it } from 'vitest';

import { createReachabilityCache } from './reachability';

/** A provider whose probes settle when the test says so. */
function controlledProvider() {
  const pending: ((result: ProbeResult) => void)[] = [];
  const provider: EmbeddingProvider = {
    ...createFakeEmbeddingProvider(),
    probe: () =>
      new Promise<ProbeResult>((resolve) => {
        pending.push(resolve);
      }),
  };

  return { provider, pending };
}

const down: ProbeResult = {
  ok: false,
  latencyMs: 3000,
  failure: { code: 'timeout', message: 'no answer' },
};

describe('createReachabilityCache', () => {
  it('shares a probe in flight and its result until the TTL has passed, failures included', async () => {
    let now = 0;
    const cache = createReachabilityCache({ now: () => now, ttlMs: 1000 });
    const { provider, pending } = controlledProvider();

    const first = cache.probe('endpoint', provider);
    const concurrent = cache.probe('endpoint', provider);
    expect(pending).toHaveLength(1);
    pending[0]!(down);
    expect(await first).toBe(down);
    expect(await concurrent).toBe(down);

    now = 999;
    expect(await cache.probe('endpoint', provider)).toBe(down);
    expect(pending).toHaveLength(1);

    now = 1000;
    const again = cache.probe('endpoint', provider);
    expect(pending).toHaveLength(2);
    pending[1]!({ ok: true, latencyMs: 1, dimensions: 32 });
    expect(await again).toMatchObject({ ok: true });
  });

  it('keeps endpoints apart', () => {
    const cache = createReachabilityCache({ now: () => 0 });
    const { provider, pending } = controlledProvider();
    void cache.probe('a', provider);
    void cache.probe('b', provider);
    expect(pending).toHaveLength(2);
  });
});
