import { randomBytes } from 'node:crypto';

import type { AuthProvider } from './session.js';

export const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const OIDC_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1024;
const DEFAULT_MAX_OIDC_TRANSACTIONS = 256;

export interface StoredAuthSession {
  readonly userId: string;
  readonly provider: AuthProvider;
  readonly providerSubject?: string;
}

export interface StoredOidcTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

interface Expiring<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface AuthStoreOptions {
  readonly now?: () => number;
  readonly idFactory?: () => string;
  readonly sessionTtlMs?: number;
  readonly oidcTransactionTtlMs?: number;
  readonly maxSessions?: number;
  readonly maxOidcTransactions?: number;
}

export class InMemoryAuthStore {
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly sessionTtlMs: number;
  private readonly oidcTransactionTtlMs: number;
  private readonly maxSessions: number;
  private readonly maxOidcTransactions: number;
  private readonly sessions = new Map<string, Expiring<StoredAuthSession>>();
  private readonly oidcTransactions = new Map<string, Expiring<StoredOidcTransaction>>();

  constructor(options: AuthStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => randomBytes(32).toString('base64url'));
    this.sessionTtlMs = positive(options.sessionTtlMs ?? AUTH_SESSION_TTL_MS, 'sessionTtlMs');
    this.oidcTransactionTtlMs = positive(
      options.oidcTransactionTtlMs ?? OIDC_TRANSACTION_TTL_MS,
      'oidcTransactionTtlMs',
    );
    this.maxSessions = positiveInteger(options.maxSessions ?? DEFAULT_MAX_SESSIONS, 'maxSessions');
    this.maxOidcTransactions = positiveInteger(
      options.maxOidcTransactions ?? DEFAULT_MAX_OIDC_TRANSACTIONS,
      'maxOidcTransactions',
    );
  }

  createSession(session: StoredAuthSession): string {
    this.pruneExpired();
    evictOldest(this.sessions, this.maxSessions);
    const id = this.uniqueId(this.sessions);
    this.sessions.set(id, { value: session, expiresAt: this.now() + this.sessionTtlMs });
    return id;
  }

  getSession(id: string | undefined): StoredAuthSession | null {
    if (!id) return null;
    return this.read(this.sessions, id);
  }

  deleteSession(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  createOidcTransaction(transaction: StoredOidcTransaction): string {
    this.pruneExpired();
    evictOldest(this.oidcTransactions, this.maxOidcTransactions);
    const id = this.uniqueId(this.oidcTransactions);
    this.oidcTransactions.set(id, {
      value: transaction,
      expiresAt: this.now() + this.oidcTransactionTtlMs,
    });
    return id;
  }

  consumeOidcTransaction(id: string | undefined): StoredOidcTransaction | null {
    if (!id) return null;
    const value = this.read(this.oidcTransactions, id);
    this.oidcTransactions.delete(id);
    return value;
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
    throw new Error('Could not allocate a unique authentication session identifier.');
  }
}

function pruneMap<T>(map: Map<string, Expiring<T>>, now: number): void {
  for (const [key, entry] of map) {
    if (entry.expiresAt <= now) map.delete(key);
  }
}

function evictOldest<T>(map: Map<string, T>, maxEntries: number): void {
  while (map.size >= maxEntries) {
    const oldest = map.keys().next().value;
    if (!oldest) return;
    map.delete(oldest);
  }
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero.`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
