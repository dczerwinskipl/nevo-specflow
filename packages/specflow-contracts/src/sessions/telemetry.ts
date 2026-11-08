import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { SessionIdSchema, SessionSequenceSchema } from './model';
import { utf8Bytes } from './commands';

const closed = { additionalProperties: false } as const;
const identifier = Type.String({ minLength: 1, maxLength: 256 });
const opaqueIdentifier = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$' });
const timestamp = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$',
});
export const TelemetryDecimalSchema = Type.String({
  pattern: '^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,12})?$',
});
const percentage = Type.String({
  pattern: '^(?:(?:0|[1-9][0-9]?)(?:\\.[0-9]{1,12})?|100(?:\\.0{1,12})?)$',
});
export const TelemetryGroupSchema = Type.Union([
  Type.Literal('usage'),
  Type.Literal('cost'),
  Type.Literal('limits'),
  Type.Literal('context'),
]);
const groups = (minItems = 0) =>
  Type.Array(TelemetryGroupSchema, { minItems, maxItems: 4, uniqueItems: true });
export const TelemetryCoverageSchema = Type.Object(
  {
    complete: Type.Boolean(),
    observedTurns: SessionSequenceSchema,
    totalTurns: SessionSequenceSchema,
  },
  closed,
);
const relationship = Type.Union([
  Type.Literal('included'),
  Type.Literal('excluded'),
  Type.Literal('unknown'),
]);
export const TelemetryTokenUsageSchema = Type.Object(
  {
    inputTokens: Type.Optional(SessionSequenceSchema),
    outputTokens: Type.Optional(SessionSequenceSchema),
    cacheReadTokens: Type.Optional(SessionSequenceSchema),
    cacheWriteTokens: Type.Optional(SessionSequenceSchema),
    reasoningTokens: Type.Optional(SessionSequenceSchema),
    coverage: TelemetryCoverageSchema,
    relationships: Type.Object(
      {
        cacheReadToInput: relationship,
        cacheWriteToInput: relationship,
        reasoningToOutput: relationship,
      },
      closed,
    ),
  },
  closed,
);
export const TelemetryMoneyUsageSchema = Type.Object(
  {
    currency: Type.Literal('USD'),
    amount: TelemetryDecimalSchema,
    basis: Type.Union([Type.Literal('provider-reported'), Type.Literal('estimated')]),
    meaning: Type.Union([
      Type.Literal('api-equivalent'),
      Type.Literal('billed'),
      Type.Literal('unknown'),
    ]),
    coverage: TelemetryCoverageSchema,
  },
  closed,
);
const limitFields = <T extends TSchema>(measurement: T) => ({
  windowId: opaqueIdentifier,
  scope: Type.Union([Type.Literal('account'), Type.Literal('model')]),
  modelId: Type.Optional(identifier),
  used: Type.Optional(measurement),
  remaining: Type.Optional(measurement),
  limit: Type.Optional(measurement),
  windowSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
  resetsAt: Type.Optional(timestamp),
});
const measuredLimit = <T extends TSchema, U extends TSchema>(measurement: T, unit: U) => {
  const fields = { ...limitFields(measurement), unit };

  return Type.Union([
    Type.Object({ ...fields, used: measurement }, closed),
    Type.Object({ ...fields, remaining: measurement }, closed),
    Type.Object({ ...fields, limit: measurement }, closed),
  ]);
};

export const TelemetryLimitWindowSchema = Type.Union([
  measuredLimit(
    TelemetryDecimalSchema,
    Type.Union([Type.Literal('tokens'), Type.Literal('requests'), Type.Literal('credits')]),
  ),
  measuredLimit(percentage, Type.Literal('percent')),
]);
export const TelemetryLimitsUsageSchema = Type.Object(
  { windows: Type.Array(TelemetryLimitWindowSchema, { maxItems: 16 }) },
  closed,
);
const contextFields = {
  contextGeneration: opaqueIdentifier,
  turnId: Type.Optional(SessionIdSchema),
  modelId: Type.Optional(identifier),
  occupiedTokens: Type.Optional(SessionSequenceSchema),
  capacityTokens: Type.Optional(SessionSequenceSchema),
  lastCompactedAt: Type.Optional(timestamp),
  breakdown: Type.Optional(
    Type.Object(
      {
        coverage: Type.Union([Type.Literal('complete'), Type.Literal('partial')]),
        components: Type.Array(
          Type.Object(
            {
              kind: Type.Union([
                Type.Literal('instructions'),
                Type.Literal('tool-definitions'),
                Type.Literal('conversation'),
                Type.Literal('tool-results'),
                Type.Literal('attachments'),
                Type.Literal('provider-state'),
              ]),
              tokens: SessionSequenceSchema,
            },
            closed,
          ),
          { maxItems: 8 },
        ),
        unclassifiedTokens: Type.Optional(SessionSequenceSchema),
      },
      closed,
    ),
  ),
};
export const TelemetryContextUsageSchema = Type.Union([
  Type.Object({ ...contextFields, occupiedTokens: SessionSequenceSchema }, closed),
  Type.Object({ ...contextFields, capacityTokens: SessionSequenceSchema }, closed),
]);

/** Availability and freshness are independent; an unavailable reading cannot carry a value. */
export function telemetryReading<T extends TSchema>(value: T) {
  const metadata = {
    freshness: Type.Union([Type.Literal('fresh'), Type.Literal('stale'), Type.Literal('unknown')]),
    observedAt: Type.Optional(timestamp),
    staleAt: Type.Optional(timestamp),
    reason: Type.Optional(
      Type.Union([
        Type.Literal('NOT_SUPPORTED'),
        Type.Literal('NOT_OBSERVED'),
        Type.Literal('NOT_AUTHORIZED'),
        Type.Literal('AUTHENTICATION_REQUIRED'),
        Type.Literal('PROVIDER_UNAVAILABLE'),
        Type.Literal('REFRESH_FAILED'),
        Type.Literal('BASELINE_MISSING'),
      ]),
    ),
    source: Type.Optional(
      Type.Union([
        Type.Literal('provider-reported'),
        Type.Literal('runtime-aggregate'),
        Type.Literal('estimated'),
      ]),
    ),
    refreshable: Type.Boolean(),
  };

  return Type.Union([
    Type.Object({ ...metadata, status: Type.Literal('unavailable') }, closed),
    Type.Object(
      {
        ...metadata,
        status: Type.Union([Type.Literal('available'), Type.Literal('partial')]),
        value,
      },
      closed,
    ),
  ]);
}

const usageReadings = <T extends TSchema>(schema: T) =>
  Type.Object(
    {
      session: telemetryReading(schema),
      turn: Type.Optional(
        Type.Object({ turnId: SessionIdSchema, reading: telemetryReading(schema) }, closed),
      ),
    },
    closed,
  );
export const TelemetrySnapshotSchema = Type.Object(
  {
    sessionId: SessionIdSchema,
    revision: SessionSequenceSchema,
    accessRevision: identifier,
    eventSeq: SessionSequenceSchema,
    usage: usageReadings(TelemetryTokenUsageSchema),
    cost: usageReadings(TelemetryMoneyUsageSchema),
    limits: telemetryReading(TelemetryLimitsUsageSchema),
    context: telemetryReading(TelemetryContextUsageSchema),
    migration: Type.Optional(
      Type.Object(
        {
          status: Type.Union([
            Type.Literal('running'),
            Type.Literal('completed'),
            Type.Literal('failed'),
          ]),
        },
        closed,
      ),
    ),
    refresh: Type.Object(
      {
        state: Type.Union([Type.Literal('idle'), Type.Literal('queued'), Type.Literal('running')]),
        groups: groups(),
        retryAfterSeconds: Type.Optional(SessionSequenceSchema),
      },
      closed,
    ),
  },
  closed,
);
export const RefreshTelemetrySchema = Type.Object(
  { requestId: SessionIdSchema, groups: groups(1) },
  closed,
);
export const RefreshTelemetryReceiptSchema = Type.Object(
  {
    requestId: SessionIdSchema,
    acceptedGroups: groups(1),
    state: Type.Union([Type.Literal('queued'), Type.Literal('running')]),
    telemetryRevision: SessionSequenceSchema,
  },
  closed,
);

export type TelemetryGroup = Static<typeof TelemetryGroupSchema>;
export type TelemetryCoverage = Static<typeof TelemetryCoverageSchema>;
export type TelemetryTokenUsage = Static<typeof TelemetryTokenUsageSchema>;
export type TelemetryMoneyUsage = Static<typeof TelemetryMoneyUsageSchema>;
export type TelemetryLimitWindow = Static<typeof TelemetryLimitWindowSchema>;
export type TelemetryLimitsUsage = Static<typeof TelemetryLimitsUsageSchema>;
export type TelemetryContextUsage = Static<typeof TelemetryContextUsageSchema>;
export type TelemetrySnapshot = Static<typeof TelemetrySnapshotSchema>;
export type RefreshTelemetry = Static<typeof RefreshTelemetrySchema>;
export type RefreshTelemetryReceipt = Static<typeof RefreshTelemetryReceiptSchema>;
export type TelemetryReading<T> =
  | (Omit<TelemetrySnapshot['context'], 'value' | 'status'> & {
      status: 'unavailable';
      value?: never;
    })
  | (Omit<TelemetrySnapshot['context'], 'value' | 'status'> & {
      status: 'available' | 'partial';
      value: T;
    });

/** Cross-field arithmetic cannot be expressed by the structural wire schema. */
export function validateTelemetryContextUsage(value: unknown): value is TelemetryContextUsage {
  if (!Value.Check(TelemetryContextUsageSchema, value)) {
    return false;
  }

  if (value.lastCompactedAt !== undefined && !validTimestamp(value.lastCompactedAt)) {
    return false;
  }

  const breakdown = value.breakdown;
  if (!breakdown) {
    return true;
  }

  if (value.occupiedTokens === undefined) {
    return false;
  }

  const kinds = breakdown.components.map((component) => component.kind);
  const classified = breakdown.components.reduce(
    (sum, component) => sum + BigInt(component.tokens),
    0n,
  );
  const occupied = BigInt(value.occupiedTokens);

  return (
    new Set(kinds).size === kinds.length &&
    classified <= occupied &&
    (breakdown.unclassifiedTokens === undefined ||
      classified + BigInt(breakdown.unclassifiedTokens) === occupied)
  );
}

export function validateTelemetrySnapshot(value: unknown): value is TelemetrySnapshot {
  if (
    !Value.Check(TelemetrySnapshotSchema, value) ||
    utf8Bytes(JSON.stringify(value)) > 32 * 1024
  ) {
    return false;
  }

  const readings = [
    value.usage.session,
    value.usage.turn?.reading,
    value.cost.session,
    value.cost.turn?.reading,
    value.limits,
    value.context,
  ];
  for (const reading of readings) {
    if (
      reading &&
      ((reading.observedAt !== undefined && !validTimestamp(reading.observedAt)) ||
        (reading.staleAt !== undefined && !validTimestamp(reading.staleAt)))
    ) {
      return false;
    }
  }

  for (const reading of [
    value.usage.session,
    value.usage.turn?.reading,
    value.cost.session,
    value.cost.turn?.reading,
  ]) {
    if (!reading || reading.status === 'unavailable') {
      continue;
    }

    const coverage = reading.value.coverage;
    if (
      coverage.observedTurns > coverage.totalTurns ||
      (coverage.complete && coverage.observedTurns !== coverage.totalTurns)
    ) {
      return false;
    }
  }

  if (
    value.limits.status !== 'unavailable' &&
    value.limits.value.windows.some(
      (window) => window.resetsAt !== undefined && !validTimestamp(window.resetsAt),
    )
  ) {
    return false;
  }

  return (
    value.context.status === 'unavailable' || validateTelemetryContextUsage(value.context.value)
  );
}

function validTimestamp(value: string): boolean {
  const millis = Date.parse(value);

  return (
    Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
