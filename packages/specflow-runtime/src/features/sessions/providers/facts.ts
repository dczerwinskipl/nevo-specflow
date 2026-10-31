import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  WorkKindSchema,
  WorkStateSchema,
  TurnOutcomeSchema,
  utf8Bytes,
  TelemetryContextUsageSchema,
  TelemetryLimitWindowSchema,
  validateTelemetryContextUsage,
} from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import type { DriverFact } from '../persistence/protocol';

const closed = { additionalProperties: false } as const;
const key = Type.String({ minLength: 1, maxLength: 256 });
const text = (maxLength: number) => Type.String({ maxLength });
const counter = Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }));
const counters = Type.Object(
  {
    inputTokens: counter,
    outputTokens: counter,
    cachedTokens: counter,
    cacheWriteTokens: counter,
    reasoningTokens: counter,
  },
  closed,
);
const question = Type.Object(
  {
    kind: Type.Literal('question'),
    prompt: text(8192),
    allowText: Type.Boolean(),
    maxSelections: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    options: Type.Optional(
      Type.Array(
        Type.Object(
          { id: Type.String({ minLength: 1, maxLength: 128 }), label: text(512) },
          closed,
        ),
        { maxItems: 20 },
      ),
    ),
  },
  closed,
);
const permission = Type.Object(
  { kind: Type.Literal('permission'), prompt: text(8192), actionSummary: text(8192) },
  closed,
);
const schema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('measurement'),
      sampleId: key,
      metric: Type.Literal('cost'),
      baseline: Type.Optional(Type.Literal(true)),
      basis: Type.Union(
        ['delta', 'turn-total', 'session-cumulative'].map((value) => Type.Literal(value)),
      ),
      value: Type.Object(
        {
          currency: Type.Literal('USD'),
          amount: Type.String({ pattern: '^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,12})?$' }),
          basis: Type.Literal('provider-reported'),
          meaning: Type.Union(
            ['api-equivalent', 'billed', 'unknown'].map((value) => Type.Literal(value)),
          ),
        },
        closed,
      ),
    },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal('measurement'),
      sampleId: key,
      metric: Type.Literal('context'),
      value: TelemetryContextUsageSchema,
    },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal('measurement'),
      sampleId: key,
      metric: Type.Literal('limits'),
      windowUpdate: Type.Optional(Type.Literal(true)),
      value: Type.Object(
        { windows: Type.Array(TelemetryLimitWindowSchema, { maxItems: 16 }) },
        closed,
      ),
    },
    closed,
  ),
  Type.Object({ kind: Type.Literal('interaction-expired'), key }, closed),
  Type.Object({ kind: Type.Literal('correlation'), providerSessionId: key }, closed),
  Type.Object(
    { kind: Type.Literal('work-open'), key, workKind: WorkKindSchema, title: text(2048) },
    closed,
  ),
  Type.Object({ kind: Type.Literal('work-update'), key, state: WorkStateSchema }, closed),
  Type.Object(
    { kind: Type.Literal('action-open'), key, parentKey: key, title: text(2048) },
    closed,
  ),
  Type.Object({ kind: Type.Literal('action-update'), key, state: WorkStateSchema }, closed),
  Type.Object(
    {
      kind: Type.Literal('text'),
      key,
      channel: Type.Union(
        ['commentary', 'reasoning', 'answer', 'tool-input', 'tool-output'].map((channel) =>
          Type.Literal(channel),
        ),
      ),
      text: text(16384),
    },
    closed,
  ),
  Type.Object(
    { kind: Type.Literal('interaction'), key, interaction: Type.Union([question, permission]) },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal('outcome'),
      outcome: TurnOutcomeSchema,
      error: Type.Optional(Type.Object({ code: text(64), message: text(2048) }, closed)),
    },
    closed,
  ),
  Type.Object({ kind: Type.Literal('lost'), message: text(2048) }, closed),
  Type.Object(
    {
      kind: Type.Literal('progress'),
      activity: Type.Union([Type.Literal('waiting'), Type.Literal('responding')]),
      label: text(1024),
    },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal('usage'),
      baseline: Type.Optional(Type.Literal(true)),
      sampleId: key,
      basis: Type.Union([
        Type.Literal('delta'),
        Type.Literal('turn-total'),
        Type.Literal('session-cumulative'),
      ]),
      counters,
    },
    closed,
  ),
]);
export function validateDriverFact(fact: DriverFact): void {
  if (!Value.Check(schema, fact)) {
    throw new SessionError(
      'SESSION_INPUT_INVALID',
      'Provider fact violates the canonical protocol.',
    );
  }

  if (
    (fact.kind === 'usage' || (fact.kind === 'measurement' && fact.metric === 'cost')) &&
    fact.baseline
  ) {
    const zero =
      fact.kind === 'usage'
        ? Object.values(fact.counters).every((count) => count === 0)
        : /^0(?:\.0+)?$/.test(fact.value.amount);
    if (fact.basis !== 'session-cumulative' || !zero) {
      throw new SessionError(
        'SESSION_INPUT_INVALID',
        'Provider baseline must establish a zero cumulative origin.',
      );
    }
  }

  if (fact.kind === 'measurement') {
    if (
      (fact.metric === 'context' && !validateTelemetryContextUsage(fact.value)) ||
      (fact.metric === 'limits' &&
        new Set(fact.value.windows.map((window) => window.windowId)).size !==
          fact.value.windows.length)
    ) {
      throw new SessionError(
        'SESSION_INPUT_INVALID',
        'Provider measurement violates the canonical protocol.',
      );
    }

    if (utf8Bytes(JSON.stringify(fact)) > 24576) {
      throw new SessionError(
        'SESSION_PAYLOAD_TOO_LARGE',
        'Provider measurement exceeds its byte budget.',
      );
    }
  }

  function bounded(value: string, bytes: number) {
    if (utf8Bytes(value) > bytes) {
      throw new SessionError('SESSION_PAYLOAD_TOO_LARGE', 'Provider fact exceeds its byte budget.');
    }
  }

  if (fact.kind === 'text') {
    bounded(fact.text, 16384);
  }

  if (fact.kind === 'work-open' || fact.kind === 'action-open') {
    bounded(fact.title, 2048);
  }

  if (fact.kind === 'progress') {
    bounded(fact.label, 1024);
  }

  if (fact.kind === 'lost') {
    bounded(fact.message, 2048);
  }

  if (fact.kind === 'outcome' && fact.error) {
    bounded(fact.error.message, 2048);
  }

  if (fact.kind === 'interaction') {
    const i = fact.interaction;
    bounded(i.prompt, 8192);
    bounded(JSON.stringify(i), 24576);
    if (i.kind === 'permission') {
      bounded(i.actionSummary, 8192);
    } else {
      for (const option of i.options ?? []) {
        bounded(option.label, 512);
      }

      if (new Set(i.options?.map((o) => o.id)).size !== (i.options?.length ?? 0)) {
        throw new SessionError('SESSION_INPUT_INVALID', 'Duplicate interaction option.');
      }
    }
  }
}
