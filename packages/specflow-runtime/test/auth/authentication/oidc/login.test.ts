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
    expect(store.consumeOidcTransaction(previousTransaction, 'old')).toEqual({ status: 'missing' });
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

    expect(store.consumeOidcTransaction(existing, 'existing')).toMatchObject({ status: 'consumed', transaction: { state: 'existing' } });
  });
  it('does not consume pending state when callback state is wrong', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'oidc-id' });
    const transactionId = store.createOidcTransaction({
      state: 'expected-state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    });
    let completeCalls = 0;
    const oidc: OidcClient = {
      start: () => Promise.reject(new Error('not used')),
      complete: () => {
        completeCalls += 1;
        return Promise.resolve({ email: 'demo@example.com' });
      },
    };

    await expect(
      completeOidcLogin(
        provider,
        store,
        oidc,
        transactionId,
        undefined,
        new URL('https://specflow.example.test/api/auth/oidc/callback?code=abc&state=wrong'),
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'invalid_oidc_transaction',
      preserveTransactionCookie: true,
    });

    expect(completeCalls).toBe(0);
    expect(store.consumeOidcTransaction(transactionId, 'expected-state')).toMatchObject({
      status: 'consumed',
      transaction: { state: 'expected-state' },
    });
  });

});
