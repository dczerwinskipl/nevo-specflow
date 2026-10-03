import { randomBytes } from 'node:crypto';

import { AuthStoreCapacityError } from './errors';
import {
  createAuthSessionPolicy,
  type AuthSessionPolicy,
  type AuthSessionPolicyOverrides,
} from './policy';
import type { AuthStore, StoredAuthSession, StoredOidcTransaction } from './state';

interface Expiring<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface AuthStoreOptions extends AuthSessionPolicyOverrides {
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

export class InMemoryAuthStore implements AuthStore {
  readonly policy: AuthSessionPolicy;

  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly sessions = new Map<string, Expiring<StoredAuthSession>>();
  private readonly oidcTransactions = new Map<string, Expiring<StoredOidcTransaction>>();

  constructor(options: AuthStoreOptions = {}) {
    this.policy = createAuthSessionPolicy(options);
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => randomBytes(32).toString('base64url'));
  }

  createSession(session: StoredAuthSession, replacingSessionId?: string): string {
    this.pruneExpired();
    const replacementExists =
      replacingSessionId !== undefined && this.sessions.has(replacingSessionId);
    if (this.sessions.size >= this.policy.maxSessions && !replacementExists) {
      throw new AuthStoreCapacityError('session');
    }

    const id = this.uniqueId(this.sessions);
    if (replacementExists) this.sessions.delete(replacingSessionId);
    this.sessions.set(id, {
      value: { ...session },
      expiresAt: this.now() + this.policy.sessionTtlMs,
    });
    return id;
  }

  getSession(id: string | undefined): StoredAuthSession | null {
    if (!id) return null;
    const value = this.read(this.sessions, id);
    return value ? { ...value } : null;
  }

  deleteSession(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  createOidcTransaction(
    transaction: StoredOidcTransaction,
    replacingTransactionId?: string,
  ): string {
    this.pruneExpired();
    const replacementExists =
      replacingTransactionId !== undefined && this.oidcTransactions.has(replacingTransactionId);
    if (this.oidcTransactions.size >= this.policy.maxOidcTransactions && !replacementExists) {
      throw new AuthStoreCapacityError('oidc_transaction');
    }

    const id = this.uniqueId(this.oidcTransactions);
    if (replacementExists) this.oidcTransactions.delete(replacingTransactionId);
    this.oidcTransactions.set(id, {
      value: { ...transaction },
      expiresAt: this.now() + this.policy.oidcTransactionTtlMs,
    });
    return id;
  }

  consumeOidcTransaction(id: string | undefined): StoredOidcTransaction | null {
    if (!id) return null;
    const value = this.read(this.oidcTransactions, id);
    this.oidcTransactions.delete(id);
    return value ? { ...value } : null;
  }

  deleteOidcTransaction(id: string | undefined): void {
    if (id) this.oidcTransactions.delete(id);
  }

  private read<T>(map: Map<string, Expiring<T>>, id: string): T | null {
    const entry = map.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      map.delete(id);
      return null;
    }
    return entry.value;
  }

  private pruneExpired(): void {
    const now = this.now();
    pruneMap(this.sessions, now);
    pruneMap(this.oidcTransactions, now);
  }

  private uniqueId<T>(map: ReadonlyMap<string, T>): string {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = this.idFactory();
      if (id && !map.has(id)) return id;
    }
    throw new Error('Could not allocate a unique authentication state identifier.');
  }
}

function pruneMap<T>(map: Map<string, Expiring<T>>, now: number): void {
  for (const [key, entry] of map) {
    if (entry.expiresAt <= now) map.delete(key);
  }
}
