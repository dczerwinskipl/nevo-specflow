import { Type, type Static } from 'typebox';
import {
  InteractionIdSchema,
  SessionIdSchema,
  SessionModeSchema,
  SessionUuidSchema,
  TurnIdSchema,
  TurnOutcomeSchema,
} from './model';

const closed = { additionalProperties: false } as const;
const choice = (maxLength: number) => Type.String({ minLength: 1, maxLength });
export const CreateSessionSchema = Type.Object(
  {
    requestId: SessionUuidSchema,
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
    requestId: SessionUuidSchema,
    message: choice(128 * 1024),
    mode: Type.Optional(SessionModeSchema),
    providerModeId: Type.Optional(choice(128)),
    modelId: Type.Optional(choice(256)),
    effort: Type.Optional(choice(64)),
  },
  closed,
);
export const CancelTurnSchema = Type.Object({ requestId: SessionUuidSchema }, closed);
export const RespondInteractionSchema = Type.Union([
  Type.Object(
    {
      requestId: SessionUuidSchema,
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
      requestId: SessionUuidSchema,
      kind: Type.Literal('permission'),
      decision: Type.Union([Type.Literal('allow'), Type.Literal('deny')]),
    },
    closed,
  ),
]);
/** `201` of `POST /api/sessions`. */
export const CreateSessionResultSchema = Type.Object({ sessionId: SessionIdSchema }, closed);
/** `202` of `POST /api/sessions/:id/turns`. */
export const StartTurnResultSchema = Type.Object({ turnId: TurnIdSchema }, closed);
/** `202` of `POST /api/sessions/:id/turns/:turnId/cancel`. */
export const CancelTurnResultSchema = Type.Object({ turnId: TurnIdSchema }, closed);
/** `202` of `POST /api/sessions/:id/interactions/:interactionId/respond`. */
export const RespondInteractionResultSchema = Type.Object(
  { turnId: TurnIdSchema, interactionId: InteractionIdSchema },
  closed,
);
/**
 * `200` of `POST /api/sessions/:id/turns/:turnId/reconcile`: the settled outcome, and whether this
 * request settled it (`false` when the Turn was already terminal with the same outcome).
 */
export const ReconcileTurnResultSchema = Type.Object(
  { turnId: TurnIdSchema, outcome: TurnOutcomeSchema, reconciled: Type.Boolean() },
  closed,
);
export const SessionErrorCodes = [
  'SESSION_INPUT_INVALID',
  'SESSION_CURSOR_INVALID',
  'SESSION_LIST_SCOPE_REQUIRED',
  'INTERACTION_RESPONSE_INVALID',
  'SESSION_NOT_FOUND',
  'SESSION_RESOURCE_NOT_FOUND',
  'TURN_CONFLICT',
  'SESSION_ARCHIVED',
  'SESSION_DELETE_BLOCKED',
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
/**
 * The `session_error` envelope of a Session refusal, answered by every Session and Session
 * association route (the Runtime's Session error handling). Its `$id` names the shared contract:
 * the Runtime OpenAPI document publishes it once, as the `SessionError` component.
 */
export const SessionErrorSchema = Type.Object(
  {
    error: Type.Literal('session_error'),
    code: Type.Union(SessionErrorCodes.map((code) => Type.Literal(code))),
    message: Type.String({ maxLength: 2048 }),
    details: Type.Optional(
      Type.Object(
        {
          field: Type.Optional(Type.String()),
          turnId: Type.Optional(TurnIdSchema),
          reason: Type.Optional(Type.String()),
          capability: Type.Optional(Type.String()),
        },
        closed,
      ),
    ),
  },
  { ...closed, $id: 'SessionError' },
);
/** How a provider executable was found: the local `executable` setting, PATH, or an install location. */
export const ExecutableSourceSchema = Type.Union([
  Type.Literal('configured'),
  Type.Literal('path'),
  Type.Literal('discovered'),
]);
/** The vendor install location an executable was discovered in; the UI names it. */
export const ExecutableLocationSchema = Type.Union([
  Type.Literal('codex-desktop-app'),
  Type.Literal('claude-native-installer'),
  Type.Literal('antigravity-installer'),
  Type.Literal('npm-global-package'),
]);
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
        /** No verified executable in the configured path, on PATH or in the provider's install locations. */
        Type.Literal('EXECUTABLE_NOT_FOUND'),
        /** An executable was found but its version command failed or did not answer in time. */
        Type.Literal('EXECUTABLE_NOT_WORKING'),
        /** A working executable was found; its login source or machine-managed policy is not supported. */
        Type.Literal('INSTALLATION_UNAVAILABLE'),
        Type.Literal('AUTHENTICATION_REQUIRED'),
        Type.Literal('PROTOCOL_UNSUPPORTED'),
        Type.Literal('RESTRICTION_UNSUPPORTED'),
        Type.Literal('KNOWN_INCOMPATIBILITY'),
        /** A verified executable failed the adapter's protocol probe (crash, timeout, refusal). */
        Type.Literal('PROBE_FAILED'),
        Type.Literal('PROCESS_SETTLEMENT_UNVERIFIED'),
        /**
         * Read for a Session started in a Specification (`?specId`): the provider runs only in the
         * Runtime's own checkout, and that Specification works in its own worktree.
         */
        Type.Literal('SPECIFICATION_WORKTREE_UNSUPPORTED'),
        /** The project's configuration does not allow the provider (`allowed` is not `true`). */
        Type.Literal('NOT_ALLOWED_BY_PROJECT'),
        /** The project allows the provider; this workstation's local configuration turns it off. */
        Type.Literal('NOT_ENABLED_ON_WORKSTATION'),
      ]),
    ),
    /** The executable the Runtime resolved and verified, and how it was found. */
    executable: Type.Optional(
      Type.Object(
        {
          path: choice(1024),
          source: ExecutableSourceSchema,
          /** The install location it was discovered in, or the npm package a PATH launcher names. */
          location: Type.Optional(ExecutableLocationSchema),
          /** The version its own version command reported. */
          version: Type.Optional(choice(128)),
        },
        closed,
      ),
    ),
    /** With `EXECUTABLE_NOT_FOUND`: every place discovery looked, in order. */
    checkedLocations: Type.Optional(
      Type.Array(
        Type.Object(
          {
            source: ExecutableSourceSchema,
            /** The searched file names for `path`; an absolute path or pattern (`*`) otherwise. */
            path: choice(1024),
            location: Type.Optional(ExecutableLocationSchema),
          },
          closed,
        ),
        { maxItems: 32 },
      ),
    ),
    /**
     * With `EXECUTABLE_NOT_FOUND`: an npm launcher found on PATH whose package's native executable
     * is missing, so the CLI looks installed but cannot be run.
     */
    unresolvedLauncher: Type.Optional(
      Type.Object({ path: choice(1024), package: choice(214) }, closed),
    ),
    /** The command that signs in to the provider's CLI, for `authenticationRequired`. */
    signInCommand: Type.Optional(choice(1100)),
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
          /**
           * The model an alias runs, when the provider says so and it is another id (Claude's
           * `opus` runs `claude-opus-5-5`): a configured full id finds the entry that offers it.
           */
          resolvedModelId: Type.Optional(choice(256)),
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
            /**
             * The `models` this mode runs (by `modelId`) when it runs only some of them (Claude's
             * auto mode only models with auto support); absent: every model. A Turn with another
             * model in this mode is refused with `MODEL_UNSUPPORTED`.
             */
            modelIds: Type.Optional(Type.Array(choice(256), { maxItems: 100 })),
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
/**
 * The longest one provider discovery runs, in milliseconds. A catalogue read re-probes a provider
 * whose last check is older than its cache, so `GET /api/session-providers` can legitimately take
 * this long on a cold machine; a client waits longer (with a margin) before treating it as failed.
 */
export const PROVIDER_DISCOVERY_BUDGET_MS = 30_000;
export type CreateSession = Static<typeof CreateSessionSchema>;
export type StartTurn = Static<typeof StartTurnSchema>;
export type RespondInteraction = Static<typeof RespondInteractionSchema>;
export type ProviderDescriptor = Static<typeof ProviderDescriptorSchema>;
export type ExecutableSource = Static<typeof ExecutableSourceSchema>;
export type ExecutableLocation = Static<typeof ExecutableLocationSchema>;
export type CreateSessionResult = Static<typeof CreateSessionResultSchema>;
export type StartTurnResult = Static<typeof StartTurnResultSchema>;
export type CancelTurnResult = Static<typeof CancelTurnResultSchema>;
export type RespondInteractionResult = Static<typeof RespondInteractionResultSchema>;
export type ReconcileTurnResult = Static<typeof ReconcileTurnResultSchema>;
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
