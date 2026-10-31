// Mirrors the (not yet merged) PR #107 contract at docs/reference/api/session-telemetry.md —
// swap to @nevo/specflow-contracts/sessions once merged, no shape changes expected.
//
// PR #107 (`feature/antigravity-provider`) defines the real backend contract for Session
// telemetry — token usage, cost, context-window occupancy, and provider rate limits — which is
// not available on `main`/this branch yet. These types are a product-owned, local mirror of that
// documented-but-unmerged contract, used only so `SessionTelemetrySection` has something honest to
// render against demo fixtures until the real import exists. Do not add fields here that are not
// in the documented contract; that discovery belongs to PR #107, not to this UI pass.

/**
 * A single observed quantity that may not have been collected, may be partially collected across
 * Turns, or may be out of date. Every telemetry quantity (`TokenUsage`, `MoneyUsage`, the limits
 * window list, `ContextUsage`) is wrapped in this envelope rather than being optional on its own,
 * so "could not be read" (`unavailable`) and "read, but it's old" (`stale`) are always distinguishable
 * from a legitimately-zero/empty value.
 */
export interface Reading<T> {
  status: 'available' | 'partial' | 'unavailable';
  freshness: 'fresh' | 'stale' | 'unknown';
  observedAt?: string;
  staleAt?: string;
  reason?:
    | 'NOT_SUPPORTED'
    | 'NOT_OBSERVED'
    | 'NOT_AUTHORIZED'
    | 'AUTHENTICATION_REQUIRED'
    | 'PROVIDER_UNAVAILABLE'
    | 'REFRESH_FAILED'
    | 'BASELINE_MISSING';
  source?: 'provider-reported' | 'runtime-aggregate' | 'estimated';
  refreshable: boolean;
  value?: T;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  coverage: { complete: boolean; observedTurns: number; totalTurns: number };
  relationships: {
    cacheReadToInput: 'included' | 'excluded' | 'unknown';
    cacheWriteToInput: 'included' | 'excluded' | 'unknown';
    reasoningToOutput: 'included' | 'excluded' | 'unknown';
  };
}

export interface MoneyUsage {
  currency: 'USD';
  /** Decimal string (e.g. `"0.42"`), never a float — avoids float rounding on a cost figure. */
  amount: string;
  basis: 'provider-reported' | 'estimated';
  meaning: 'api-equivalent' | 'billed' | 'unknown';
  coverage: { complete: boolean; observedTurns: number; totalTurns: number };
}

export interface LimitWindow {
  windowId: string;
  scope: 'account' | 'model';
  modelId?: string;
  unit: 'tokens' | 'requests' | 'credits' | 'percent';
  used?: string;
  remaining?: string;
  limit?: string;
  windowSeconds?: number;
  resetsAt?: string;
}

export interface ContextUsage {
  contextGeneration: string;
  turnId?: string;
  modelId?: string;
  occupiedTokens?: number;
  capacityTokens?: number;
  lastCompactedAt?: string;
  breakdown?: {
    coverage: 'complete' | 'partial';
    components: {
      kind:
        | 'instructions'
        | 'tool-definitions'
        | 'conversation'
        | 'tool-results'
        | 'attachments'
        | 'provider-state';
      tokens: number;
    }[];
    unclassifiedTokens?: number;
  };
}

export interface TelemetrySnapshot {
  sessionId: string;
  revision: number;
  accessRevision: string;
  eventSeq: number;
  usage: { session: Reading<TokenUsage>; turn?: { turnId: string; reading: Reading<TokenUsage> } };
  cost: { session: Reading<MoneyUsage>; turn?: { turnId: string; reading: Reading<MoneyUsage> } };
  limits: Reading<{ windows: LimitWindow[] }>;
  context: Reading<ContextUsage>;
  refresh: {
    state: 'idle' | 'queued' | 'running';
    groups: ('usage' | 'cost' | 'limits' | 'context')[];
    retryAfterSeconds?: number;
  };
}

/**
 * Whether `SessionTelemetrySection` has anything at all to show for this snapshot. Used both by
 * that component (to decide whether to render) and by `SessionContext` (so a Session whose ONLY
 * populated Context dimension is telemetry doesn't fall through to the "no additional context"
 * empty state). Mirrors the per-dimension "missing data hides the section" principle: a snapshot
 * where every one of usage/cost/limits/context is `unavailable` is exactly as absent as no
 * snapshot at all.
 */
export function isTelemetryVisible(telemetry: TelemetrySnapshot | undefined): boolean {
  if (!telemetry) {
    return false;
  }

  return (
    telemetry.usage.session.status !== 'unavailable' ||
    telemetry.cost.session.status !== 'unavailable' ||
    telemetry.limits.status !== 'unavailable' ||
    telemetry.context.status !== 'unavailable'
  );
}

/** Demo fixtures. Not backend payloads — see the module header above. Shaped to look like
 * plausible real telemetry (realistic token counts, a small USD amount, a believable
 * occupancy/limit percentage), not round/placeholder numbers. */

const fullCoverage = { complete: true, observedTurns: 6, totalTurns: 6 };

/** State: everything observed, fresh, nothing truncated. */
export const fullTelemetrySnapshot: TelemetrySnapshot = {
  sessionId: 'session-telemetry-full',
  revision: 42,
  accessRevision: 'rev-42',
  eventSeq: 418,
  usage: {
    session: {
      status: 'available',
      freshness: 'fresh',
      observedAt: '2026-10-31T09:12:00Z',
      source: 'provider-reported',
      refreshable: true,
      value: {
        inputTokens: 12400,
        outputTokens: 3200,
        cacheReadTokens: 8100,
        reasoningTokens: 640,
        coverage: fullCoverage,
        relationships: {
          cacheReadToInput: 'excluded',
          cacheWriteToInput: 'excluded',
          reasoningToOutput: 'included',
        },
      },
    },
  },
  cost: {
    session: {
      status: 'available',
      freshness: 'fresh',
      observedAt: '2026-10-31T09:12:00Z',
      source: 'provider-reported',
      refreshable: true,
      value: {
        currency: 'USD',
        amount: '0.47',
        basis: 'provider-reported',
        meaning: 'billed',
        coverage: fullCoverage,
      },
    },
  },
  limits: {
    status: 'available',
    freshness: 'fresh',
    observedAt: '2026-10-31T09:12:00Z',
    source: 'provider-reported',
    refreshable: true,
    value: {
      windows: [
        {
          windowId: 'account-5h',
          scope: 'account',
          unit: 'tokens',
          used: '210000',
          limit: '500000',
          windowSeconds: 18000,
          resetsAt: '2026-10-31T13:00:00Z',
        },
        {
          windowId: 'account-weekly',
          scope: 'account',
          unit: 'requests',
          used: '640',
          limit: '5000',
          windowSeconds: 604800,
          resetsAt: '2026-11-03T00:00:00Z',
        },
      ],
    },
  },
  context: {
    status: 'available',
    freshness: 'fresh',
    observedAt: '2026-10-31T09:12:00Z',
    source: 'runtime-aggregate',
    refreshable: true,
    value: {
      contextGeneration: 'gen-9',
      turnId: 'turn-37',
      modelId: 'claude-sonnet-5',
      occupiedTokens: 86000,
      capacityTokens: 200000,
    },
  },
  refresh: { state: 'idle', groups: [] },
};

/**
 * State: partial — reflects Antigravity's own documented real-world constraint ("bare cost has no
 * proven currency and remains unavailable"): usage/limits/context are observed, but cost cannot be
 * attributed to a trustworthy currency at all, so it stays `unavailable` with `NOT_SUPPORTED`
 * rather than being shown as `$0` or guessed at.
 */
export const partialAntigravityTelemetrySnapshot: TelemetrySnapshot = {
  sessionId: 'session-telemetry-partial',
  revision: 17,
  accessRevision: 'rev-17',
  eventSeq: 203,
  usage: {
    session: {
      status: 'partial',
      freshness: 'fresh',
      observedAt: '2026-10-31T08:40:00Z',
      source: 'runtime-aggregate',
      refreshable: true,
      value: {
        inputTokens: 5600,
        outputTokens: 1150,
        coverage: { complete: false, observedTurns: 3, totalTurns: 5 },
        relationships: {
          cacheReadToInput: 'unknown',
          cacheWriteToInput: 'unknown',
          reasoningToOutput: 'unknown',
        },
      },
    },
  },
  cost: {
    session: {
      status: 'unavailable',
      freshness: 'unknown',
      reason: 'NOT_SUPPORTED',
      refreshable: false,
    },
  },
  limits: {
    status: 'available',
    freshness: 'fresh',
    observedAt: '2026-10-31T08:40:00Z',
    source: 'provider-reported',
    refreshable: true,
    value: {
      windows: [
        {
          windowId: 'account-5h',
          scope: 'account',
          unit: 'percent',
          used: '42',
          windowSeconds: 18000,
          resetsAt: '2026-10-31T12:00:00Z',
        },
      ],
    },
  },
  context: {
    status: 'unavailable',
    freshness: 'unknown',
    reason: 'NOT_OBSERVED',
    refreshable: true,
  },
  refresh: { state: 'idle', groups: [] },
};

/** State: fully unavailable — `SessionTelemetrySection` must render nothing at all for this. */
export const unavailableTelemetrySnapshot: TelemetrySnapshot = {
  sessionId: 'session-telemetry-unavailable',
  revision: 1,
  accessRevision: 'rev-1',
  eventSeq: 4,
  usage: { session: { status: 'unavailable', freshness: 'unknown', refreshable: false } },
  cost: { session: { status: 'unavailable', freshness: 'unknown', refreshable: false } },
  limits: { status: 'unavailable', freshness: 'unknown', refreshable: false },
  context: { status: 'unavailable', freshness: 'unknown', refreshable: false },
  refresh: { state: 'idle', groups: [] },
};

/** State: available but stale — observed a while ago, provider refresh not yet confirmed; every
 * dimension here must show the subtle "stale" cue rather than reading as live. */
export const staleTelemetrySnapshot: TelemetrySnapshot = {
  sessionId: 'session-telemetry-stale',
  revision: 9,
  accessRevision: 'rev-9',
  eventSeq: 61,
  usage: {
    session: {
      status: 'available',
      freshness: 'stale',
      observedAt: '2026-10-30T22:05:00Z',
      staleAt: '2026-10-31T06:05:00Z',
      source: 'provider-reported',
      refreshable: true,
      value: {
        inputTokens: 31200,
        outputTokens: 9080,
        cacheWriteTokens: 2200,
        coverage: { complete: true, observedTurns: 11, totalTurns: 11 },
        relationships: {
          cacheReadToInput: 'excluded',
          cacheWriteToInput: 'excluded',
          reasoningToOutput: 'included',
        },
      },
    },
  },
  cost: {
    session: {
      status: 'available',
      freshness: 'stale',
      observedAt: '2026-10-30T22:05:00Z',
      staleAt: '2026-10-31T06:05:00Z',
      source: 'estimated',
      refreshable: true,
      value: {
        currency: 'USD',
        amount: '1.08',
        basis: 'estimated',
        meaning: 'api-equivalent',
        coverage: { complete: true, observedTurns: 11, totalTurns: 11 },
      },
    },
  },
  limits: {
    status: 'available',
    freshness: 'stale',
    observedAt: '2026-10-30T22:05:00Z',
    staleAt: '2026-10-31T06:05:00Z',
    source: 'provider-reported',
    refreshable: true,
    value: {
      windows: [
        {
          windowId: 'model-gpt-5h',
          scope: 'model',
          modelId: 'gpt-5.1',
          unit: 'tokens',
          used: '390000',
          limit: '400000',
          windowSeconds: 18000,
          resetsAt: '2026-10-31T03:05:00Z',
        },
      ],
    },
  },
  context: {
    status: 'available',
    freshness: 'stale',
    observedAt: '2026-10-30T22:05:00Z',
    staleAt: '2026-10-31T06:05:00Z',
    source: 'runtime-aggregate',
    refreshable: true,
    value: {
      contextGeneration: 'gen-4',
      turnId: 'turn-20',
      occupiedTokens: 178000,
      capacityTokens: 200000,
    },
  },
  refresh: { state: 'queued', groups: ['usage', 'cost'] },
};
