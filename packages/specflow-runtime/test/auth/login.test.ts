import { describe, expect, it } from 'vitest';

import type { RuntimeAuthConfig } from '../../src/auth/config.js';
import type { OidcClient } from '../../src/auth/oidc.js';
import { completeOidcLogin, startOidcLogin } from '../../src/auth/oidc-login.js';
import { loginWithPassword } from '../../src/auth/password-login.js';
import { InMemoryAuthStore } from '../../src/auth/session-store.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

const auth: RuntimeAuthConfig = {
  mode: 'required',
  users: {
    'demo-user': { name: 'Demo User' },
  },
  providers: {
    password: {
      enabled: true,
      accounts: {
        demo: {
          userId: 'demo-user',
          passwordHash: PASSWORD_HASH,
        },
      },
    },
    oidc: {
      enabled: true,
      issuer: 'https://issuer.example.test',
      clientId: 'client-id',
      clientSecret: 'local-secret',
      allowedEmails: {
        'demo@example.com': 'demo-user',
      },
    },
  },
};

function store(): InMemoryAuthStore {
  let id = 0;
  return new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
}

describe('auth login operations', () => {
  it('replaces the current session after successful password login', async () => {
    const sessions = store();
    const previous = sessions.createSession({ userId: 'demo-user', provider: 'oidc' });

    const result = await loginWithPassword(
      auth,
      sessions,
      previous,
      'demo',
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
    expect(sessions.getSession(previous)).toBeNull();
    if (result.ok) {
      expect(sessions.getSession(result.sessionId)).toMatchObject({
        userId: 'demo-user',
        provider: 'password',
      });
    }
  });

  it('owns OIDC transaction and identity-to-session orchestration', async () => {
    const sessions = store();
    const transaction = { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction,
        }),
      complete: (_callbackUrl, stored) => {
        expect(stored).toEqual(transaction);
        return Promise.resolve({
          subject: 'subject',
          email: ' Demo@Example.com ',
        });
      },
    };

    const started = await startOidcLogin(
      auth,
      sessions,
      oidc,
      'https://specflow.example.test/api/auth/oidc/callback',
    );
    expect(started).toMatchObject({
      ok: true,
      authorizationUrl: new URL('https://issuer.example.test/authorize'),
    });
    if (!started.ok) {
      throw new Error('Expected OIDC login to start.');
    }

    const result = await completeOidcLogin(
      auth,
      sessions,
      oidc,
      started.transactionId,
      undefined,
      new URL('https://specflow.example.test/api/auth/oidc/callback?code=abc&state=state'),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(sessions.getSession(result.sessionId)).toEqual({
        userId: 'demo-user',
        provider: 'oidc',
        providerSubject: 'subject',
      });
    }
  });
});
