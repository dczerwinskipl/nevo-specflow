import { describe, expect, it } from 'vitest';

import { InMemoryAuthStore } from '../../src/auth/session-store.js';

describe('InMemoryAuthStore', () => {
  it('expires sessions and consumes OIDC transactions once', () => {
    let now = 1_000;
    let nextId = 0;
    const store = new InMemoryAuthStore({
      now: () => now,
      idFactory: () => `id-${++nextId}`,
      sessionTtlMs: 100,
      oidcTransactionTtlMs: 50,
    });

    const sessionId = store.createSession({ userId: 'demo-user', provider: 'password' });
    expect(store.getSession(sessionId)).toEqual({ userId: 'demo-user', provider: 'password' });
    now = 1_101;
    expect(store.getSession(sessionId)).toBeNull();

    now = 2_000;
    const transactionId = store.createOidcTransaction({
      state: 'state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    });
    expect(store.consumeOidcTransaction(transactionId)).toEqual({
      state: 'state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    });
    expect(store.consumeOidcTransaction(transactionId)).toBeNull();
  });

  it('bounds stored entries by evicting the oldest live value', () => {
    let nextId = 0;
    const store = new InMemoryAuthStore({
      idFactory: () => `id-${++nextId}`,
      maxSessions: 2,
    });

    const first = store.createSession({ userId: 'one', provider: 'password' });
    const second = store.createSession({ userId: 'two', provider: 'password' });
    const third = store.createSession({ userId: 'three', provider: 'password' });

    expect(store.getSession(first)).toBeNull();
    expect(store.getSession(second)?.userId).toBe('two');
    expect(store.getSession(third)?.userId).toBe('three');
  });
});
