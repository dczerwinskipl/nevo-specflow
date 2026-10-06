export interface AuthenticationStorePolicy {
  readonly sessionTtlMs: number;
  readonly oidcTransactionTtlMs: number;
  readonly maxSessions: number;
  readonly maxOidcTransactions: number;
}

export type AuthenticationStorePolicyOverrides = Partial<AuthenticationStorePolicy>;

export const DEFAULT_AUTHENTICATION_STORE_POLICY: AuthenticationStorePolicy = Object.freeze({
  sessionTtlMs: 12 * 60 * 60 * 1000,
  oidcTransactionTtlMs: 10 * 60 * 1000,
  maxSessions: 1_024,
  maxOidcTransactions: 256,
});

export function createAuthenticationStorePolicy(
  overrides: AuthenticationStorePolicyOverrides = {},
): AuthenticationStorePolicy {
  return Object.freeze({
    sessionTtlMs: positiveInteger(
      overrides.sessionTtlMs ?? DEFAULT_AUTHENTICATION_STORE_POLICY.sessionTtlMs,
      'sessionTtlMs',
    ),
    oidcTransactionTtlMs: positiveInteger(
      overrides.oidcTransactionTtlMs ?? DEFAULT_AUTHENTICATION_STORE_POLICY.oidcTransactionTtlMs,
      'oidcTransactionTtlMs',
    ),
    maxSessions: positiveInteger(
      overrides.maxSessions ?? DEFAULT_AUTHENTICATION_STORE_POLICY.maxSessions,
      'maxSessions',
    ),
    maxOidcTransactions: positiveInteger(
      overrides.maxOidcTransactions ?? DEFAULT_AUTHENTICATION_STORE_POLICY.maxOidcTransactions,
      'maxOidcTransactions',
    ),
  });
}

export function ttlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
