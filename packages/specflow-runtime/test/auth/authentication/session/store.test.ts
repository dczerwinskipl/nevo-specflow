import { describe, expect, it } from 'vitest';

import { AuthStoreCapacityError } from '../../../../src/auth/authentication/session/errors';
import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';

const oidcTransaction = (state: string) => ({
  state,
  nonce: 'nonce',
  codeVerifier: 'verifier',
  providerId: 'company',
  returnTo: '/specs',
});

describe('InMemoryAuthStore', () => {
  it('expires sessions and consumes provider-aware OIDC transactions once', () => {
    let now = 1_000;
    let nextId = 0;
    const store = new InMemoryAuthStore({
      now: () => now,
      idFactory: () => `id-${++nextId}`,
      sessionTtlMs: 100,
      oidcTransactionTtlMs: 50,
    });

    const sessionId = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    expect(store.getSession(sessionId)).toEqual({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    now = 1_101;
    expect(store.getSession(sessionId)).toBeNull();

    now = 2_000;
    const transactionId = store.createOidcTransaction(oidcTransaction('state'));
    expect(store.consumeOidcTransaction(transactionId, 'state')).toEqual({
      status: 'consumed',
      transaction: oidcTransaction('state'),
    });
    expect(store.consumeOidcTransaction(transactionId, 'state')).toEqual({ status: 'missing' });
  });

  it('fails closed at session capacity without evicting live sessions', () => {
    let nextId = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${++nextId}`,
      maxSessions: 2,
    });

    const first = store.createSession({ userId: 'one', authenticatedWith: { kind: 'password' } });
    const second = store.createSession({ userId: 'two', authenticatedWith: { kind: 'password' } });

    expect(() =>
      store.createSession({ userId: 'three', authenticatedWith: { kind: 'password' } }),
    ).toThrowError(AuthStoreCapacityError);
    expect(store.getSession(first)?.userId).toBe('one');
    expect(store.getSession(second)?.userId).toBe('two');
  });

  it('replaces the current session atomically even when the store is full', () => {
    let nextId = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${++nextId}`,
      maxSessions: 1,
    });
    const current = store.createSession({
      userId: 'one',
      authenticatedWith: { kind: 'password' },
    });

    const replacement = store.createSession(
      {
        userId: 'one',
        userName: 'OIDC User',
        authenticatedWith: { kind: 'oidc', providerId: 'company' },
      },
      current,
    );

    expect(store.getSession(current)).toBeNull();
    expect(store.getSession(replacement)).toEqual({
      userId: 'one',
      userName: 'OIDC User',
      authenticatedWith: { kind: 'oidc', providerId: 'company' },
    });
  });

  it('fails closed at OIDC transaction capacity without invalidating live state', () => {
    let nextId = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${++nextId}`,
      maxOidcTransactions: 1,
    });
    const current = store.createOidcTransaction(oidcTransaction('one'));

    expect(() => store.createOidcTransaction(oidcTransaction('two'))).toThrowError(
      AuthStoreCapacityError,
    );
    expect(store.consumeOidcTransaction(current, 'one')).toMatchObject({
      status: 'consumed',
      transaction: { state: 'one', providerId: 'company', returnTo: '/specs' },
    });
  });

  it('publishes the effective immutable policy used by server-side state', () => {
    const store = new InMemoryAuthStore({ sessionTtlMs: 1_234 });
    expect(store.policy.sessionTtlMs).toBe(1_234);
    expect(Object.isFrozen(store.policy)).toBe(true);
  });

  it('does not consume an OIDC transaction when state does not match', () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'oidc-id' });
    const id = store.createOidcTransaction(oidcTransaction('expected'));

    expect(store.consumeOidcTransaction(id, 'attacker-state')).toEqual({
      status: 'state_mismatch',
    });
    expect(store.consumeOidcTransaction(id, 'expected')).toMatchObject({
      status: 'consumed',
      transaction: { state: 'expected' },
    });
  });
});
