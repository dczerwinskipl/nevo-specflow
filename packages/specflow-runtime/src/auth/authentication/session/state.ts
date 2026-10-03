import type { AuthProvider } from '@nevo/specflow-contracts/authentication';

import type { AuthSessionPolicy } from './policy';

export interface StoredAuthSession {
  readonly userId: string;
  readonly provider: AuthProvider;
}

export interface StoredOidcTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

export interface AuthStore {
  readonly policy: AuthSessionPolicy;

  createSession(session: StoredAuthSession, replacingSessionId?: string): string;
  getSession(id: string | undefined): StoredAuthSession | null;
  deleteSession(id: string | undefined): void;

  createOidcTransaction(
    transaction: StoredOidcTransaction,
    replacingTransactionId?: string,
  ): string;
  consumeOidcTransaction(id: string | undefined): StoredOidcTransaction | null;
  deleteOidcTransaction(id: string | undefined): void;
}
