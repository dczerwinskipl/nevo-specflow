import { Type, type Static } from 'typebox';
import { SessionIdSchema, SessionModeSchema } from './model';

const closed = { additionalProperties: false } as const;
const choice = (maxLength: number) => Type.String({ minLength: 1, maxLength });
export const CreateSessionSchema = Type.Object(
  {
    requestId: SessionIdSchema,
    providerId: choice(128),
    modelId: Type.Optional(choice(256)),
    mode: SessionModeSchema,
    providerModeId: Type.Optional(choice(128)),
    effort: Type.Optional(choice(64)),
    title: Type.Optional(Type.String({ maxLength: 256 })),
  },
  closed,
);
export const StartTurnSchema = Type.Object(
  {
    requestId: SessionIdSchema,
    message: choice(128 * 1024),
    mode: Type.Optional(SessionModeSchema),
    providerModeId: Type.Optional(choice(128)),
    modelId: Type.Optional(choice(256)),
    effort: Type.Optional(choice(64)),
  },
  closed,
);
export const CancelTurnSchema = Type.Object({ requestId: SessionIdSchema }, closed);
export const RespondInteractionSchema = Type.Union([
  Type.Object(
    {
      requestId: SessionIdSchema,
      kind: Type.Literal('question'),
      answer: Type.Object(
        {
          optionIds: Type.Array(choice(128), { maxItems: 20, uniqueItems: true }),
          text: Type.Optional(Type.String({ maxLength: 16 * 1024 })),
        },
        closed,
      ),
    },
    closed,
  ),
  Type.Object(
    {
      requestId: SessionIdSchema,
      kind: Type.Literal('permission'),
      decision: Type.Union([Type.Literal('allow'), Type.Literal('deny')]),
    },
    closed,
  ),
]);
export const SessionErrorCodes = [
  'SESSION_INPUT_INVALID',
  'SESSION_CURSOR_INVALID',
  'INTERACTION_RESPONSE_INVALID',
  'SESSION_NOT_FOUND',
  'SESSION_RESOURCE_NOT_FOUND',
  'TURN_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INTERACTION_EXPIRED',
  'SESSION_CURSOR_EXPIRED',
  'CONTENT_REVISION_UNAVAILABLE',
  'SESSION_RECOVERY_REQUIRED',
  'SESSION_PAYLOAD_TOO_LARGE',
  'CAPABILITY_UNSUPPORTED',
  'MODEL_UNSUPPORTED',
  'SESSION_DISABLED',
  'SESSION_STORE_BUSY',
  'SESSION_STORE_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_AUTH_REQUIRED',
  'PROVIDER_CATALOGUE_UNAVAILABLE',
] as const;
export const SessionErrorSchema = Type.Object(
  {
    error: Type.Literal('session_error'),
    code: Type.Union(SessionErrorCodes.map((code) => Type.Literal(code))),
    message: Type.String({ maxLength: 2048 }),
    details: Type.Optional(
      Type.Object(
        {
          field: Type.Optional(Type.String()),
          turnId: Type.Optional(SessionIdSchema),
          reason: Type.Optional(Type.String()),
          capability: Type.Optional(Type.String()),
        },
        closed,
      ),
    ),
  },
  closed,
);
export const ProviderDescriptorSchema = Type.Object(
  {
    providerId: choice(128),
    title: choice(512),
    readiness: Type.Union([
      Type.Literal('ready'),
      Type.Literal('unavailable'),
      Type.Literal('authenticationRequired'),
      Type.Literal('unknown'),
    ]),
    reason: Type.Optional(Type.String({ maxLength: 512 })),
    reasonCode: Type.Optional(
      Type.Union([
        Type.Literal('INSTALLATION_UNAVAILABLE'),
        Type.Literal('AUTHENTICATION_REQUIRED'),
        Type.Literal('PROTOCOL_UNSUPPORTED'),
        Type.Literal('RESTRICTION_UNSUPPORTED'),
        Type.Literal('KNOWN_INCOMPATIBILITY'),
        Type.Literal('PROBE_FAILED'),
        Type.Literal('PROCESS_SETTLEMENT_UNVERIFIED'),
      ]),
    ),
    compatibility: Type.Optional(
      Type.Object(
        {
          classification: Type.Union([
            Type.Literal('tested'),
            Type.Literal('provisional'),
            Type.Literal('unsupported'),
          ]),
          protocolProfile: choice(128),
          version: Type.Optional(choice(128)),
        },
        closed,
      ),
    ),
    capabilities: Type.Object(
      {
        questions: Type.Boolean(),
        permissions: Type.Boolean(),
        cancel: Type.Boolean(),
        resume: Type.Boolean(),
        modelOverride: Type.Boolean(),
        effortOverride: Type.Boolean(),
      },
      closed,
    ),
    models: Type.Array(
      Type.Object(
        {
          modelId: choice(256),
          title: choice(512),
          efforts: Type.Array(choice(64), { maxItems: 16 }),
        },
        closed,
      ),
      { maxItems: 100 },
    ),
    modes: Type.Array(SessionModeSchema, { maxItems: 2, uniqueItems: true }),
    defaultModeId: Type.Optional(choice(128)),
    providerModes: Type.Optional(
      Type.Array(
        Type.Object(
          {
            modeId: choice(128),
            title: choice(256),
            nativeMode: choice(128),
            compatibility: Type.Optional(
              Type.Union([
                Type.Literal('tested'),
                Type.Literal('provisional'),
                Type.Literal('unsupported'),
              ]),
            ),
            mode: SessionModeSchema,
            readiness: Type.Union([Type.Literal('ready'), Type.Literal('unavailable')]),
            authorized: Type.Optional(Type.Boolean()),
            reason: Type.Optional(Type.String({ maxLength: 512 })),
          },
          closed,
        ),
        { maxItems: 16 },
      ),
    ),
  },
  closed,
);
export const ProviderCatalogueSchema = Type.Object(
  { items: Type.Array(ProviderDescriptorSchema, { maxItems: 32 }) },
  closed,
);
export type CreateSession = Static<typeof CreateSessionSchema>;
export type StartTurn = Static<typeof StartTurnSchema>;
export type RespondInteraction = Static<typeof RespondInteractionSchema>;
export type ProviderDescriptor = Static<typeof ProviderDescriptorSchema>;
export type SessionErrorCode = (typeof SessionErrorCodes)[number];

/** JSON Schema bounds characters; application validation also enforces UTF-8 byte budgets. */
export function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const point of value) {
    const code = point.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }

  return bytes;
}
