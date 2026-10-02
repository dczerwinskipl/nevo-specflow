import { describe, expect, it } from 'vitest';

import {
  anonymousCredentials,
  bearerTokenCredentials,
  cookieCredentials,
  customCredentials,
} from './credentials';

describe('credential providers', () => {
  it('supports anonymous access without request credentials', async () => {
    await expect(anonymousCredentials().resolve({})).resolves.toBeUndefined();
  });

  it('enables browser cookie credentials', async () => {
    await expect(cookieCredentials().resolve({})).resolves.toEqual({
      withCredentials: true,
    });
  });

  it('resolves bearer tokens per request without storing them', async () => {
    let token = 'first';
    const credentials = bearerTokenCredentials(() => token);

    await expect(credentials.resolve({ url: '/one' })).resolves.toEqual({
      headers: { Authorization: 'Bearer first' },
    });

    token = 'second';

    await expect(credentials.resolve({ url: '/two' })).resolves.toEqual({
      headers: { Authorization: 'Bearer second' },
    });
  });

  it('omits bearer credentials when the application has no token', async () => {
    const credentials = bearerTokenCredentials(() => undefined);

    await expect(credentials.resolve({ url: '/resource' })).resolves.toBeUndefined();
  });

  it('passes request context to application-owned credential flows', async () => {
    const credentials = customCredentials(({ method, url }) => ({
      headers: { 'X-Test-Context': `${method} ${url}` },
    }));

    await expect(credentials.resolve({ method: 'post', url: '/resource' })).resolves.toEqual({
      headers: { 'X-Test-Context': 'post /resource' },
    });
  });
});
