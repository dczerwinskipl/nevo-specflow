export function createRetryableOidcDiscovery<T>(discover: () => Promise<T>): () => Promise<T> {
  let resolved: { readonly value: T } | undefined;
  let pending: Promise<T> | undefined;

  return async () => {
    if (resolved) return resolved.value;
    if (pending) return pending;

    pending = discover()
      .then((value) => {
        resolved = { value };
        return value;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };
}
