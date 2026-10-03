import { describe, expect, it } from 'vitest';

import type { RuntimeAuthConfig } from '../../../../src/auth/authentication/config/model';
import { InMemoryPasswordAccountThrottle } from '../../../../src/auth/authentication/password/account-throttle';
import { loginWithPassword } from '../../../../src/auth/authentication/password/login';
import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';
import { PASSWORD_HASH } from '../../support/config';

const auth: RuntimeAuthConfig = {
  mode: 'required',
  users: { 'demo-user': { name: 'Demo User' } },
  providers: {
    password: {
      enabled: true,
      accounts: {
        demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
      },
    },
    oidc: { enabled: false, allowedEmails: {} },
  },
};

describe('password login operation', () => {
  it('replaces the current session after successful login', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
    const previous = store.createSession({ userId: 'demo-user', provider: 'oidc' });

    const result = await loginWithPassword(
      auth,
      store,
      new InMemoryPasswordAccountThrottle(),
      previous,
      'DEMO',
      'correct horse battery staple',
    );

    expect(result).toMatchObject({
      ok: true,
      session: {
        authenticated: true,
        provider: 'password',
        user: { id: 'demo-user' },
      },
    });
    expect(store.getSession(previous)).toBeNull();
  });

  it('does not run password verification after the account throttle rejects an attempt', async () => {
    const store = new InMemoryAuthStore();
    const throttle = new InMemoryPasswordAccountThrottle({
      accountLimit: 1,
      accountWindowMs: 60_000,
    });

    await expect(
      loginWithPassword(auth, store, throttle, undefined, 'demo', 'wrong'),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_credentials' });

    await expect(
      loginWithPassword(auth, store, throttle, undefined, 'demo', 'correct horse battery staple'),
    ).resolves.toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('fails closed without evicting another live session when the store is full', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${String(++id)}`,
      maxSessions: 1,
    });
    const existing = store.createSession({ userId: 'other-user', provider: 'password' });

    await expect(
      loginWithPassword(
        auth,
        store,
        new InMemoryPasswordAccountThrottle(),
        undefined,
        'demo',
        'correct horse battery staple',
      ),
    ).resolves.toEqual({ ok: false, error: 'service_unavailable' });

    expect(store.getSession(existing)).toEqual({
      userId: 'other-user',
      provider: 'password',
    });
  });
});
