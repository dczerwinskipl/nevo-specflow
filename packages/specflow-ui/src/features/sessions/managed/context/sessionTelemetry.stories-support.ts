import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';

/**
 * Telemetry snapshots for stories and tests, typed as the real contract and checked against
 * `validateTelemetrySnapshot` (`sessionTelemetry.test.ts`) so they cannot drift from it. Shaped
 * like plausible real telemetry (realistic token counts, a small USD amount, believable
 * occupancy/limit percentages), not round placeholder numbers.
 */

/** The Turn `fullTelemetrySnapshot`'s context-window reading measured. */
export const telemetryMeasuredTurnId = '00000000-0000-4000-8000-0000000007b1';
/** The Turn `staleTelemetrySnapshot`'s context-window reading measured. */
export const staleTelemetryMeasuredTurnId = '00000000-0000-4000-8000-0000000007b2';

const fullCoverage = { complete: true, observedTurns: 6, totalTurns: 6 };

/** State: everything observed, fresh, nothing truncated. */
export const fullTelemetrySnapshot: TelemetrySnapshot = {
  sessionId: '00000000-0000-4000-8000-0000000007a1',
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
      turnId: telemetryMeasuredTurnId,
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
  sessionId: '00000000-0000-4000-8000-0000000007a2',
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
  sessionId: '00000000-0000-4000-8000-0000000007a3',
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
  sessionId: '00000000-0000-4000-8000-0000000007a4',
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
      turnId: staleTelemetryMeasuredTurnId,
      occupiedTokens: 178000,
      capacityTokens: 200000,
    },
  },
  refresh: { state: 'queued', groups: ['usage', 'cost'] },
};

/** `fullTelemetrySnapshot` with other provider limits (and optionally refresh state). */
function withLimits(
  limits: TelemetrySnapshot['limits'],
  refresh: TelemetrySnapshot['refresh'] = { state: 'idle', groups: [] },
): TelemetrySnapshot {
  return { ...fullTelemetrySnapshot, limits, refresh };
}

const lastLimitsReading = fullTelemetrySnapshot.limits;

/** Refresh-control states (full-session.md "Context"). */
export const limitsTelemetry = {
  /** Codex before its first account read: refreshable, nothing observed yet. */
  notRead: withLimits({
    status: 'unavailable',
    freshness: 'unknown',
    reason: 'NOT_OBSERVED',
    refreshable: true,
  }),
  /** Read, but the provider reported no windows. */
  zeroWindows: withLimits({
    status: 'available',
    freshness: 'fresh',
    observedAt: '2026-10-31T09:12:00Z',
    source: 'provider-reported',
    refreshable: true,
    value: { windows: [] },
  }),
  /** A refresh is running in the Runtime. */
  running: withLimits(lastLimitsReading, { state: 'running', groups: ['limits'] }),
  /** The last refresh failed; the previous reading is kept. */
  failedWithValues: withLimits({
    ...lastLimitsReading,
    freshness: 'stale',
    reason: 'REFRESH_FAILED',
  }),
  /** The refresh failed and there is no previous reading. */
  failedWithoutValues: withLimits({
    status: 'unavailable',
    freshness: 'unknown',
    reason: 'REFRESH_FAILED',
    refreshable: true,
  }),
  /** Readings the provider cannot refresh on request (Claude). */
  notRefreshable: withLimits({ ...lastLimitsReading, refreshable: false }),
  /** The user may not see account limits: the whole limits section is masked. */
  notAuthorized: withLimits({
    status: 'unavailable',
    freshness: 'unknown',
    reason: 'NOT_AUTHORIZED',
    refreshable: false,
  }),
} satisfies Record<string, TelemetrySnapshot>;
