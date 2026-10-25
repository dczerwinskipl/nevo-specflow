import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  WorkKindSchema,
  WorkStateSchema,
  TurnOutcomeSchema,
  utf8Bytes,
} from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import type { DriverFact } from '../persistence/protocol';

const closed = { additionalProperties: false } as const;
const key = Type.String({ minLength: 1, maxLength: 256 });
const text = (maxLength: number) => Type.String({ maxLength });
const counter = Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }));
const counters = Type.Object(
  { inputTokens: counter, outputTokens: counter, cachedTokens: counter, reasoningTokens: counter },
  closed,
);
const question = Type.Object(
  {
    kind: Type.Literal('question'),
    prompt: text(8192),
    allowText: Type.Boolean(),
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
  if (!Value.Check(schema, fact))
    throw new SessionError(
      'SESSION_INPUT_INVALID',
      'Provider fact violates the canonical protocol.',
    );
  function bounded(value: string, bytes: number) {
    if (utf8Bytes(value) > bytes)
      throw new SessionError('SESSION_PAYLOAD_TOO_LARGE', 'Provider fact exceeds its byte budget.');
  }
  if (fact.kind === 'text') bounded(fact.text, 16384);
  if (fact.kind === 'work-open' || fact.kind === 'action-open') bounded(fact.title, 2048);
  if (fact.kind === 'progress') bounded(fact.label, 1024);
  if (fact.kind === 'lost') bounded(fact.message, 2048);
  if (fact.kind === 'outcome' && fact.error) bounded(fact.error.message, 2048);
  if (fact.kind === 'interaction') {
    const i = fact.interaction;
    bounded(i.prompt, 8192);
    bounded(JSON.stringify(i), 24576);
    if (i.kind === 'permission') bounded(i.actionSummary, 8192);
    else {
      for (const option of i.options ?? []) bounded(option.label, 512);
      if (new Set(i.options?.map((o) => o.id)).size !== (i.options?.length ?? 0))
        throw new SessionError('SESSION_INPUT_INVALID', 'Duplicate interaction option.');
    }
  }
}
