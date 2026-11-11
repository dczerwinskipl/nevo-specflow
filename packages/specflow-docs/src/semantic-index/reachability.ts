// The reachability probe of `semantic status` and `GET /api/docs/status`, shared by the status calls
// of one process (a CLI run, a Runtime instance) so that repeated status requests during an outage
// neither wait for the endpoint again nor send it a probe each.

import type { EmbeddingProvider, ProbeResult } from '@nevo/ai-semantic-search';

/** How long a probe result, success or failure, answers later status calls. */
export const REACHABILITY_TTL_MS = 5000;

export interface ReachabilityCache {
  /**
   * The probe result for the endpoint `key` names: a result settled less than the TTL ago, the
   * probe in flight, or a new probe of `provider` (the query provider, bounded by its timeout).
   */
  probe(key: string, provider: EmbeddingProvider): Promise<ProbeResult>;
}

export interface ReachabilityCacheOptions {
  /** Default `Date.now`. */
  readonly now?: () => number;
  /** Default `REACHABILITY_TTL_MS`. */
  readonly ttlMs?: number;
}

export function createReachabilityCache(options: ReachabilityCacheOptions = {}): ReachabilityCache {
  const { now = Date.now, ttlMs = REACHABILITY_TTL_MS } = options;
  const entries = new Map<
    string,
    { readonly result: Promise<ProbeResult>; settledAt: number | undefined }
  >();

  return {
    probe(key, provider) {
      const cached = entries.get(key);
      if (
        cached !== undefined &&
        (cached.settledAt === undefined || now() - cached.settledAt < ttlMs)
      ) {
        return cached.result;
      }

      // A provider's probe reports failures as results; a throw is a contract violation and is
      // not kept, so the next call probes again.
      const result = provider.probe();
      const entry: { readonly result: Promise<ProbeResult>; settledAt: number | undefined } = {
        result,
        settledAt: undefined,
      };
      entries.set(key, entry);
      result.then(
        () => {
          entry.settledAt = now();
        },
        () => {
          if (entries.get(key) === entry) {
            entries.delete(key);
          }
        },
      );

      return result;
    },
  };
}
