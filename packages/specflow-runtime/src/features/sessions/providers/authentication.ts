const MAX_REJECTED_LOGINS = 64;

/** Local readiness evidence only. No tokens, refresh authority or Turn state. */
export function createProviderAuthentication() {
  let verified: string | undefined;
  const rejected = new Set<string>();

  return {
    isRejected: (fingerprint: string) => rejected.has(fingerprint),
    verified(fingerprint: string) {
      verified = fingerprint;
    },
    /** Whether this is the last verified login; the caller owns evidence freshness. */
    reject(fingerprint: string) {
      rejected.delete(fingerprint);
      rejected.add(fingerprint);
      if (rejected.size > MAX_REJECTED_LOGINS) {
        for (const candidate of rejected) {
          if (candidate === verified) {
            continue;
          }

          rejected.delete(candidate);
          break;
        }
      }

      return !verified || fingerprint === verified;
    },
  };
}
