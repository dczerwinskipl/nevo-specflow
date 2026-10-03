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

export type OidcTransactionConsumption =
  | { readonly status: 'consumed'; readonly transaction: StoredOidcTransaction }
  | { readonly status: 'missing' }
  | { readonly status: 'state_mismatch' };

export interface AuthStore {
  readonly policy: AuthSessionPolicy;

  createSession(session: StoredAuthSession, replacingSessionId?: string): string;
  getSession(id: string | undefined): StoredAuthSession | null;
  deleteSession(id: string | undefined): void;

  createOidcTransaction(
    transaction: StoredOidcTransaction,
    replacingTransactionId?: string,
  ): string;
  consumeOidcTransaction(
    id: string | undefined,
    expectedState: string,
  ): OidcTransactionConsumption;
  deleteOidcTransaction(id: string | undefined): void;
}
