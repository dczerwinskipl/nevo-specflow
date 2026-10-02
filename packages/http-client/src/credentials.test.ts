import { describe, expect, it } from 'vitest';

import {
  anonymousCredentials,
  bearerTokenCredentials,
  cookieCredentials,
  customCredentials,
} from './credentials';

describe('credential providers', () => {
  it('does not add package-level request credentials', async () => {
    const resolved = await Promise.resolve(
      anonymousCredentials().resolve({ method: 'get', url: '/resource' }),
    );

    expect(resolved).toBeUndefined();
  });

  it('enables browser cookie credentials', async () => {
    const resolved = await Promise.resolve(
      cookieCredentials().resolve({ method: 'get', url: '/resource' }),
    );

    expect(resolved).toEqual({
      includeCookies: true,
    });
  });

  it('resolves bearer tokens per request without storing them', async () => {
    let token = 'first';
    const credentials = bearerTokenCredentials(() => token);

    await expect(credentials.resolve({ method: 'get', url: '/one' })).resolves.toEqual({
      headers: { Authorization: 'Bearer first' },
    });

    token = 'second';

    await expect(credentials.resolve({ method: 'get', url: '/two' })).resolves.toEqual({
      headers: { Authorization: 'Bearer second' },
    });
  });

  it('omits bearer credentials when the application has no token', async () => {
    const credentials = bearerTokenCredentials(() => undefined);

    await expect(credentials.resolve({ method: 'get', url: '/resource' })).resolves.toBeUndefined();
  });

  it('passes request context to application-owned credential flows', async () => {
    const credentials = customCredentials(({ method, url }) => ({
      headers: { 'X-Test-Context': `${method} ${url}` },
    }));

    const resolved = await Promise.resolve(
      credentials.resolve({ method: 'post', url: '/resource' }),
    );

    expect(resolved).toEqual({
      headers: { 'X-Test-Context': 'post /resource' },
    });
  });
});
