import { describe, expect, it } from 'vitest';

import type { RuntimeOidcEnabledProviderConfig } from '../../../../src/auth/authentication/config/model';
import type { OidcClient } from '../../../../src/auth/authentication/oidc/client';
import { completeOidcLogin, startOidcLogin } from '../../../../src/auth/authentication/oidc/login';
import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';

const provider: RuntimeOidcEnabledProviderConfig = {
  name: 'Company SSO',
  enabled: true,
  issuer: 'https://issuer.example.test',
  clientId: 'client-id',
  clientSecret: 'secret',
  allowedEmails: { 'demo@example.com': 'demo-user' },
};

const storedTransaction = (state: string, providerId = 'company') => ({
  state,
  nonce: 'nonce',
  codeVerifier: 'verifier',
  providerId,
  returnTo: '/specs/S1',
});

describe('OIDC login operation', () => {
  it('replaces pending transaction state and creates a provider-aware canonical user session', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
    const previousTransaction = store.createOidcTransaction(storedTransaction('old'));
    const transaction = { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction,
        }),
      complete: (_callbackUrl, stored) => {
        expect(stored).toMatchObject(transaction);
        return Promise.resolve({ email: ' Demo@Example.com ', name: 'Dominik Example' });
      },
    };

    const started = await startOidcLogin(
      'company',
      '/specs/S1',
      store,
      oidc,
      previousTransaction,
      'https://specflow.example.test/api/auth/oidc/company/callback',
    );
    expect(started.ok).toBe(true);
    expect(store.consumeOidcTransaction(previousTransaction, 'old')).toEqual({
      status: 'missing',
    });
    if (!started.ok) throw new Error('Expected OIDC login to start.');

    const completed = await completeOidcLogin(
      'company',
      provider,
      store,
      oidc,
      started.transactionId,
      undefined,
      new URL('https://specflow.example.test/api/auth/oidc/company/callback?code=abc&state=state'),
    );

    expect(completed).toMatchObject({ ok: true, returnTo: '/specs/S1' });
    if (completed.ok) {
      expect(store.getSession(completed.sessionId)).toEqual({
        userId: 'demo-user',
        userName: 'Dominik Example',
        authenticatedWith: { kind: 'oidc', providerId: 'company' },
      });
    }
  });

  it('rejects a callback routed to a different OIDC provider', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'transaction-id' });
    const transactionId = store.createOidcTransaction(storedTransaction('state', 'company'));
    const oidc: OidcClient = {
      start: () => Promise.reject(new Error('not used')),
      complete: () => Promise.reject(new Error('must not run')),
    };

    await expect(
      completeOidcLogin(
        'customer',
        provider,
        store,
        oidc,
        transactionId,
        undefined,
        new URL(
          'https://specflow.example.test/api/auth/oidc/customer/callback?code=abc&state=state',
        ),
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'invalid_oidc_transaction',
      preserveTransactionCookie: false,
      returnTo: '/specs/S1',
    });
  });

  it('does not consume pending state when callback state is wrong', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'oidc-id' });
    const transactionId = store.createOidcTransaction(storedTransaction('expected-state'));
    let completeCalls = 0;
    const oidc: OidcClient = {
      start: () => Promise.reject(new Error('not used')),
      complete: () => {
        completeCalls += 1;
        return Promise.resolve({ email: 'demo@example.com', name: 'Demo User' });
      },
    };

    await expect(
      completeOidcLogin(
        'company',
        provider,
        store,
        oidc,
        transactionId,
        undefined,
        new URL(
          'https://specflow.example.test/api/auth/oidc/company/callback?code=abc&state=wrong',
        ),
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
