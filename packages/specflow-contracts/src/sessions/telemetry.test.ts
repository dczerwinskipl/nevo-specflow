import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { SessionChangeSchema } from './model';
import {
  RefreshTelemetrySchema,
  RefreshTelemetryReceiptSchema,
  TelemetryContextUsageSchema,
  TelemetryLimitWindowSchema,
  TelemetryMoneyUsageSchema,
  TelemetrySnapshotSchema,
  validateTelemetryContextUsage,
  validateTelemetrySnapshot,
  type TelemetrySnapshot,
} from './telemetry';

const id = '10000000-0000-4000-8000-000000000001';
const coverage = { complete: true, observedTurns: 1, totalTurns: 1 };
const unavailable = {
  status: 'unavailable',
  freshness: 'unknown',
  reason: 'NOT_OBSERVED',
  refreshable: false,
} as const;
const snapshot = (): TelemetrySnapshot => ({
  sessionId: id,
  revision: 0,
  accessRevision: 'authorized-generation',
  eventSeq: 0,
  usage: { session: { ...unavailable } },
  cost: { session: { ...unavailable } },
  limits: { ...unavailable },
  context: { ...unavailable },
  refresh: { state: 'idle', groups: [] },
});

describe('Session telemetry wire contract', () => {
  it('requires four groups, discriminates availability and rejects unknown fields', () => {
    const value = snapshot();
    expect(validateTelemetrySnapshot(value)).toBe(true);
    expect(Value.Check(TelemetrySnapshotSchema, { ...value, limits: undefined })).toBe(false);
    expect(Value.Check(TelemetrySnapshotSchema, { ...value, nativeAccount: 'secret' })).toBe(false);
    expect(
      Value.Check(TelemetrySnapshotSchema, {
        ...value,
        context: { ...unavailable, value: { contextGeneration: 'a', occupiedTokens: 0 } },
      }),
    ).toBe(false);
    expect(
      Value.Check(TelemetrySnapshotSchema, {
        ...value,
        context: { status: 'available', freshness: 'fresh', refreshable: false },
      }),
    ).toBe(false);
  });

  it('keeps partial accounting independent of freshness and rejects impossible coverage', () => {
    const value = snapshot();
    value.usage.session = {
      status: 'partial',
      freshness: 'fresh',
      refreshable: false,
      observedAt: '2026-10-31T00:00:00.000Z',
      value: {
        inputTokens: 0,
        cacheWriteTokens: 12,
        coverage: { complete: false, observedTurns: 1, totalTurns: 2 },
        relationships: {
          cacheReadToInput: 'unknown',
          cacheWriteToInput: 'excluded',
          reasoningToOutput: 'included',
        },
      },
    };
    expect(validateTelemetrySnapshot(value)).toBe(true);
    value.usage.session.value.coverage.complete = true;
    expect(validateTelemetrySnapshot(value)).toBe(false);
    value.usage.session.value.coverage = coverage;
    value.usage.session.value.inputTokens = Number.MAX_SAFE_INTEGER + 1;
    expect(validateTelemetrySnapshot(value)).toBe(false);
  });

  it('requires exact decimal money with explicit currency, meaning and coverage', () => {
    const money = {
      currency: 'USD',
      amount: '0.000000000001',
      basis: 'provider-reported',
      meaning: 'api-equivalent',
      coverage,
    };
    expect(Value.Check(TelemetryMoneyUsageSchema, money)).toBe(true);
    for (const amount of ['-1', '01', '1e-3', '1.0000000000001', '10000000000000000', 0, null]) {
      expect(Value.Check(TelemetryMoneyUsageSchema, { ...money, amount })).toBe(false);
    }

    expect(Value.Check(TelemetryMoneyUsageSchema, { ...money, currency: 'EUR' })).toBe(false);
  });

  it('requires a limit metric and bounds percent values without floating point coercion', () => {
    const window = { windowId: 'model-window', scope: 'model', unit: 'percent', used: '100.000' };
    expect(Value.Check(TelemetryLimitWindowSchema, window)).toBe(true);
    expect(Value.Check(TelemetryLimitWindowSchema, { ...window, used: '100.001' })).toBe(false);
    expect(Value.Check(TelemetryLimitWindowSchema, { ...window, used: undefined })).toBe(false);
    expect(Value.Check(TelemetryLimitWindowSchema, { ...window, windowId: 'private/path' })).toBe(
      false,
    );
    expect(Value.Check(TelemetryLimitWindowSchema, { ...window, windowSeconds: 0 })).toBe(false);
  });

  it('requires a measured context and checks disjoint category identity and exact remainder', () => {
    expect(Value.Check(TelemetryContextUsageSchema, { contextGeneration: 'context-1' })).toBe(
      false,
    );
    const context = {
      contextGeneration: 'context-1',
      occupiedTokens: 100,
      breakdown: {
        coverage: 'partial',
        components: [{ kind: 'conversation', tokens: 60 }],
        unclassifiedTokens: 40,
      },
    };
    expect(validateTelemetryContextUsage(context)).toBe(true);
    expect(validateTelemetryContextUsage({ ...context, occupiedTokens: 50 })).toBe(false);
    expect(
      validateTelemetryContextUsage({
        ...context,
        breakdown: { ...context.breakdown, unclassifiedTokens: 41 },
      }),
    ).toBe(false);
    expect(
      validateTelemetryContextUsage({
        ...context,
        breakdown: {
          coverage: 'partial',
          components: [...context.breakdown.components, ...context.breakdown.components],
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid UTC dates and a payload exceeding the UTF-8 byte budget', () => {
    const value = snapshot();
    value.limits.observedAt = '2026-02-30T00:00:00Z';
    expect(validateTelemetrySnapshot(value)).toBe(false);
    value.limits.observedAt = '2026-10-31T00:00:00+01:00';
    expect(validateTelemetrySnapshot(value)).toBe(false);
    const large = snapshot();
    large.limits = {
      status: 'available',
      freshness: 'fresh',
      refreshable: false,
      value: {
        windows: Array.from({ length: 16 }, () => ({
          windowId: 'w'.repeat(256),
          scope: 'model',
          modelId: '\u0000'.repeat(256),
          unit: 'tokens',
          used: '1234567890123456.123456789012',
          remaining: '1234567890123456.123456789012',
          limit: '1234567890123456.123456789012',
          windowSeconds: Number.MAX_SAFE_INTEGER,
          resetsAt: '2026-10-31T00:00:00.000Z',
        })),
      },
    };
    // A structurally bounded projection must still pass the overall encoded-byte budget.
    large.accessRevision = '😀'.repeat(128);
    expect(Value.Check(TelemetrySnapshotSchema, large)).toBe(true);
    expect(validateTelemetrySnapshot(large)).toBe(false);
  });

  it('requires unique nonempty refresh groups and canonical request IDs', () => {
    expect(
      Value.Check(RefreshTelemetrySchema, { requestId: id, groups: ['limits', 'context'] }),
    ).toBe(true);
    for (const groups of [[], ['limits', 'limits'], ['unknown']]) {
      expect(Value.Check(RefreshTelemetrySchema, { requestId: id, groups })).toBe(false);
    }

    expect(Value.Check(RefreshTelemetrySchema, { requestId: 'native-id', groups: ['usage'] })).toBe(
      false,
    );
    expect(
      Value.Check(RefreshTelemetrySchema, { requestId: id, groups: ['usage'], force: true }),
    ).toBe(false);
    expect(
      Value.Check(RefreshTelemetryReceiptSchema, {
        requestId: id,
        acceptedGroups: ['usage'],
        state: 'queued',
        telemetryRevision: 1,
      }),
    ).toBe(true);
  });

  it('accepts only bounded telemetry invalidation on the shared Session stream', () => {
    const event = {
      sessionId: id,
      eventSeq: 2,
      kind: 'telemetry',
      changes: { telemetryRevision: 1 },
    };
    expect(Value.Check(SessionChangeSchema, event)).toBe(true);
    expect(Value.Check(SessionChangeSchema, { ...event, changes: { telemetryRevision: -1 } })).toBe(
      false,
    );
    expect(
      Value.Check(SessionChangeSchema, {
        ...event,
        changes: { telemetryRevision: 1, windows: [] },
      }),
    ).toBe(false);
  });
});
