import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const SPEC = 'spec-rate-limited';
const WORKSPACE = '5d4a0e96-0e87-4a99-9b7c-5fbec16dc005';

// The global endpoint policy (`server/endpoint-policy.ts`) is registered before the product routes:
// the Close routes share its budget like every other route, with no limiter of their own.
describe('Close endpoints under the endpoint policy', () => {
  it.each([
    ['Specification Close', `/api/specs/${SPEC}/close`],
    ['worktree Close', `/api/specs/${SPEC}/worktree/close`],
    ['workspace Close', `/api/workspaces/${WORKSPACE}/close`],
  ])('answers one %s within the budget, then 429 before the handler', async (_name, url) => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      {
        ...config,
        server: { ...config.server, rateLimit: { max: 1, timeWindowMs: 60_000 } },
        authentication: { ...config.authentication, mode: 'none' },
      },
      { dataMode: 'demo' },
    );
    const close = () => app.inject({ method: 'POST', url, payload: { operationId: randomUUID() } });
    try {
      expect((await close()).statusCode).not.toBe(429);
      const denied = await close();
      expect(denied.statusCode).toBe(429);
      expect(denied.json()).toMatchObject({ error: 'rate_limited' });
      expect(denied.headers['retry-after']).toBeDefined();
      expect(denied.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });
});
