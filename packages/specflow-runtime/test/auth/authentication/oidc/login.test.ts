import { describe, expect, it } from 'vitest';

import type { RuntimeOidcEnabledProviderConfig } from '../../../../src/auth/authentication/config/model';
import type { OidcClient } from '../../../../src/auth/authentication/oidc/client';
import { completeOidcLogin, startOidcLogin } from '../../../../src/auth/authentication/oidc/login';
import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';

const provider: RuntimeOidcEnabledProviderConfig = {
  enabled: true,
  issuer: 'https://issuer.example.test',
  clientId: 'client-id',
  clientSecret: 'secret',
  allowedEmails: { 'demo@example.com': 'demo-user' },
};

describe('OIDC login operation', () => {
  it('replaces pending transaction state and creates a canonical user session', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
    const previousTransaction = store.createOidcTransaction({
      state: 'old',
      nonce: 'old',
      codeVerifier: 'old',
    });
    const transaction = { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction,
        }),
      complete: (_callbackUrl, stored) => {
        expect(stored).toEqual(transaction);
        return Promise.resolve({ email: ' Demo@Example.com ' });
      },
    };

    const started = await startOidcLogin(
      store,
      oidc,
      previousTransaction,
      'https://specflow.example.test/api/auth/oidc/callback',
    );
    expect(started.ok).toBe(true);
    expect(store.consumeOidcTransaction(previousTransaction)).toBeNull();
    if (!started.ok) throw new Error('Expected OIDC login to start.');

    const completed = await completeOidcLogin(
      provider,
      store,
      oidc,
      started.transactionId,
      undefined,
      new URL('https://specflow.example.test/api/auth/oidc/callback?code=abc&state=state'),
    );

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(store.getSession(completed.sessionId)).toEqual({
        userId: 'demo-user',
        provider: 'oidc',
      });
    }
  });

  it('does not evict a live transaction when OIDC state capacity is full', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${String(++id)}`,
      maxOidcTransactions: 1,
    });
    const existing = store.createOidcTransaction({
      state: 'existing',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    });
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction: { state: 'new', nonce: 'nonce', codeVerifier: 'verifier' },
        }),
      complete: () => Promise.reject(new Error('not used')),
    };

    await expect(
      startOidcLogin(
        store,
        oidc,
        undefined,
        'https://specflow.example.test/api/auth/oidc/callback',
      ),
    ).resolves.toEqual({ ok: false, error: 'service_unavailable' });

    expect(store.consumeOidcTransaction(existing)?.state).toBe('existing');
  });
});
