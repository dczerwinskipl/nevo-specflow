export const OIDC_DISCOVERY_RETRY_DELAY_MS = 5_000;

export interface OidcDiscoveryRetryOptions {
  readonly now?: () => number;
  readonly retryDelayMs?: number;
}

export function createRetryableOidcDiscovery<T>(
  discover: () => Promise<T>,
  options: OidcDiscoveryRetryOptions = {},
): () => Promise<T> {
  const now = options.now ?? Date.now;
  const retryDelayMs = options.retryDelayMs ?? OIDC_DISCOVERY_RETRY_DELAY_MS;
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error('OIDC discovery retryDelayMs must be a non-negative number.');
  }

  let resolved: { readonly value: T } | undefined;
  let pending: Promise<T> | undefined;
  let failure: { readonly error: unknown; readonly retryAt: number } | undefined;

  return async () => {
    if (resolved) return resolved.value;
    if (pending) return pending;
    if (failure && now() < failure.retryAt) throw failure.error;

    pending = discover()
      .then((value) => {
        resolved = { value };
        failure = undefined;
        return value;
      })
      .catch((error: unknown) => {
        failure = { error, retryAt: now() + retryDelayMs };
        throw error;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };
}
