import { describe, expect, it } from 'vitest';

import { createRuntimeApp } from '../../src/server/app';
import { oidcConfig } from '../auth/support/config';

describe('Runtime root route', () => {
  it('redirects the Runtime API root to the configured web app origin', async () => {
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }));

    try {
      const response = await app.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://specflow.example.test:4318/');
    } finally {
      await app.close();
    }
  });
});
