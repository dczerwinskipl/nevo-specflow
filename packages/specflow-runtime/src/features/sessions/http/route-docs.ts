import { AuthorizationForbiddenErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import {
  RateLimitedErrorResponseSchema,
  RequestErrorResponseSchema,
} from '@nevo/specflow-contracts/runtime';
import { SessionErrorSchema, type SessionErrorCode } from '@nevo/specflow-contracts/sessions';

import type { OpenApiDocumentedResponse } from '../../../server/openapi';
import { contractRef } from '../../../server/shared-contracts';
import { SessionError } from '../errors';

/** What each status of a Session refusal means, ahead of its codes. */
const SESSION_ERROR_MEANINGS: Readonly<Record<number, string>> = {
  400: 'The request is invalid',
  404: 'Not found',
  409: 'Conflicts with the current state of the resource',
  413: 'The request or the addressed content is too large',
  422: 'The selected provider, model or capability is unsupported',
  503: 'Temporarily unavailable',
};

/**
 * The description of the Session refusals of one status: what the status means and the codes the
 * route answers with it.
 */
function sessionErrorDescription(status: number, codes: readonly SessionErrorCode[]) {
  const listed = codes.map((code) => `\`${code}\``);
  const meaning = SESSION_ERROR_MEANINGS[status];
  if (!meaning) {
    throw new Error(`No meaning of Session error status ${status}.`);
  }

  return `${meaning}: a \`session_error\` with \`code\` ${
    listed.length === 1 ? listed[0] : `one of ${listed.join(', ')}`
  }.`;
}

/**
 * The Session refusals a route can answer, documented as `session_error` bodies (documentation
 * only: the Session error handling sends them without a response schema, which would change their
 * serialization). Each code is answered with its `SessionError.statusCode`, so one response per
 * status lists its codes; a route lists only codes with a thrower on its own path.
 */
export function sessionErrors(
  ...codes: readonly SessionErrorCode[]
): Readonly<Record<number, OpenApiDocumentedResponse>> {
  const byStatus = new Map<number, SessionErrorCode[]>();
  for (const code of codes) {
    const status = new SessionError(code, '').statusCode;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  return Object.fromEntries(
    [...byStatus].map(([status, listed]) => [
      status,
      { description: sessionErrorDescription(status, listed), contract: SessionErrorSchema },
    ]),
  );
}

/**
 * The refusals every Session route can answer: request validation (Fastify, answered by the
 * Session error handling) and, on every coordinator use, managed Sessions disabled and the Session
 * store's admission (`SESSION_STORE_BUSY`) and lifecycle (`SESSION_STORE_UNAVAILABLE`).
 */
export const SESSION_ROUTE_REFUSALS = [
  'SESSION_INPUT_INVALID',
  'SESSION_DISABLED',
  'SESSION_STORE_BUSY',
  'SESSION_STORE_UNAVAILABLE',
] as const satisfies readonly SessionErrorCode[];

/**
 * The Session refusals of a route with a JSON body. The Session error handling also answers the
 * body limit (`FST_ERR_CTP_BODY_TOO_LARGE`) as `413 SESSION_PAYLOAD_TOO_LARGE`, but it leaves a
 * body the framework cannot read to the Runtime error handling, which answers Fastify's own error:
 * a malformed or empty JSON body is a `400` beside the `session_error`, a media type without a
 * parser (neither JSON nor text) a `415`.
 */
export function sessionBodyErrors(
  ...codes: readonly SessionErrorCode[]
): Readonly<Record<number, OpenApiDocumentedResponse>> {
  const errors = sessionErrors(...codes, 'SESSION_PAYLOAD_TOO_LARGE');
  const invalid = errors[400];
  if (!invalid) {
    throw new Error('A route with a body is validated, so it answers SESSION_INPUT_INVALID.');
  }

  return {
    ...errors,
    400: {
      description:
        `${invalid.description.slice(0, -1)}; or, for a malformed or empty JSON body, the ` +
        'request error with `code` `FST_ERR_CTP_INVALID_JSON_BODY` or ' +
        '`FST_ERR_CTP_EMPTY_JSON_BODY`.',
      contract: [SessionErrorSchema, RequestErrorResponseSchema],
    },
    415: {
      description:
        'Unsupported media type: the body is neither `application/json` nor `text/plain` ' +
        '(a text body fails validation as `SESSION_INPUT_INVALID`); the request error ' +
        'with `code` `FST_ERR_CTP_INVALID_MEDIA_TYPE`.',
      contract: RequestErrorResponseSchema,
    },
  };
}

/**
 * The Session refusals of each Session route, from the throwers on its path: the Session lookup of
 * the authorization (`SESSION_NOT_FOUND`), the store operation the handler runs and the provider
 * validation of a create or a start.
 */
export const sessionRouteErrors = {
  /** `?sessionId=` looks the Session up; `?specId=` and `?sessionId=` together are refused. */
  providers: sessionErrors(...SESSION_ROUTE_REFUSALS, 'SESSION_NOT_FOUND'),
  /** The list cursor, and an unfiltered list for a caller with only Specification grants. */
  list: sessionErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_CURSOR_INVALID',
    'SESSION_LIST_SCOPE_REQUIRED',
    'SESSION_CURSOR_EXPIRED',
  ),
  snapshot: sessionErrors(...SESSION_ROUTE_REFUSALS, 'SESSION_NOT_FOUND'),
  /** The history cursor is required and expires. */
  history: sessionErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_CURSOR_INVALID',
    'SESSION_NOT_FOUND',
    'SESSION_CURSOR_EXPIRED',
  ),
  /** The Turn or the work item is looked up in the Session; the page cursor expires. */
  page: sessionErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_CURSOR_INVALID',
    'SESSION_NOT_FOUND',
    'SESSION_RESOURCE_NOT_FOUND',
    'SESSION_CURSOR_EXPIRED',
  ),
  /** The content, its revision and the offset (outside the content, not a UTF-8 boundary). */
  content: sessionErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'SESSION_RESOURCE_NOT_FOUND',
    'CONTENT_REVISION_UNAVAILABLE',
  ),
  /** The replay cursor (`after`, `Last-Event-ID`), before the stream opens. */
  events: sessionErrors(...SESSION_ROUTE_REFUSALS, 'SESSION_CURSOR_INVALID', 'SESSION_NOT_FOUND'),
  telemetry: sessionErrors(...SESSION_ROUTE_REFUSALS, 'SESSION_NOT_FOUND'),
  /** The refresh request replay, the refreshable groups and the provider's telemetry source. */
  telemetryRefresh: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'CAPABILITY_UNSUPPORTED',
    'PROVIDER_UNAVAILABLE',
  ),
  /** The create replay and the provider validation of the selection. */
  create: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'IDEMPOTENCY_CONFLICT',
    'MODEL_UNSUPPORTED',
    'CAPABILITY_UNSUPPORTED',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_AUTH_REQUIRED',
  ),
  /** The start replay, the message, archive and Turn state, the provider validation, recovery. */
  start: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'SESSION_ARCHIVED',
    'TURN_CONFLICT',
    'SESSION_RECOVERY_REQUIRED',
    'MODEL_UNSUPPORTED',
    'CAPABILITY_UNSUPPORTED',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_AUTH_REQUIRED',
  ),
  /** The Turn is looked up; an execution of unknown outcome must be reconciled first. */
  cancel: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'SESSION_RESOURCE_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'SESSION_RECOVERY_REQUIRED',
  ),
  /** A Turn without verifiable pending execution cannot be reconciled. */
  reconcile: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'SESSION_RECOVERY_REQUIRED',
  ),
  /** The answer must match the open interaction of a live Turn of a writable Session. */
  respond: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'INTERACTION_RESPONSE_INVALID',
    'SESSION_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'SESSION_ARCHIVED',
    'INTERACTION_EXPIRED',
  ),
  /** Rename and unarchive: the command replay. */
  manage: sessionBodyErrors(...SESSION_ROUTE_REFUSALS, 'SESSION_NOT_FOUND', 'IDEMPOTENCY_CONFLICT'),
  /** Archiving also needs the current Turn settled. */
  archive: sessionBodyErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'IDEMPOTENCY_CONFLICT',
    'TURN_CONFLICT',
  ),
  /** A Session with an unsettled Turn or unsettled Engine execution evidence is kept. */
  delete: sessionErrors(
    ...SESSION_ROUTE_REFUSALS,
    'SESSION_NOT_FOUND',
    'TURN_CONFLICT',
    'SESSION_DELETE_BLOCKED',
  ),
};

/**
 * The `403` of a Session route: every Session route checks a Session capability (or the start
 * checks of a create) and refuses a caller without it.
 */
export const capabilityRefusal = { 403: contractRef(AuthorizationForbiddenErrorResponseSchema) };

/**
 * OpenAPI group and summary of the reads of the Session screen. Project mode serves them from the
 * Session coordinator and demo mode from the demo catalogue: one route, one description.
 */
export const sessionReadDocs = {
  providers: { tags: ['Session Providers'], summary: 'List the agent providers and models' },
  snapshot: { tags: ['Sessions'], summary: 'Read a Session' },
  history: { tags: ['Sessions'], summary: 'Read older conversation history of a Session' },
  work: { tags: ['Sessions'], summary: 'Read the work of a Turn' },
  actions: { tags: ['Sessions'], summary: 'Read the ToolActions of a work item' },
  content: { tags: ['Sessions'], summary: 'Read content of a Session' },
  telemetry: { tags: ['Session Telemetry'], summary: 'Read the telemetry of a Session' },
  events: { tags: ['Sessions'], summary: 'Stream the events of a Session' },
};

/**
 * The replay header of `GET /api/sessions/:sessionId/events` (documentation only: the stream
 * checks it itself, see `SessionStreams.open`).
 */
export const sessionEventReplayParameters = {
  header: {
    'Last-Event-ID':
      'The sequence of the last Session event the client received (an EventSource sends it on ' +
      'reconnect): the stream replays the events after it. The same cursor as `after`; when both ' +
      'are present they must be equal. Answers `400 SESSION_CURSOR_INVALID` when repeated, not ' +
      'equal to `after`, not a non-negative integer or beyond the latest event. An empty value ' +
      'reads as `0` (replay of every retained event). Without either, the stream starts at the ' +
      'latest event.',
  },
} as const;

/** The event stream of `GET /api/sessions/:sessionId/events` (documentation only, see `openApiResponses`). */
export const sessionEventStream: Readonly<Record<number, OpenApiDocumentedResponse>> = {
  200: {
    description:
      'Server-sent events of the Session: `session-change` events whose `id` is the event ' +
      'sequence and whose `data` is the JSON Session event, and `resync-required` when the ' +
      'client must read the Session again. Replay starts after `after` or `Last-Event-ID`; ' +
      'comment lines keep the connection alive.',
    headers: { 'Cache-Control': '`no-store`.' },
    mediaType: 'text/event-stream',
  },
  // The stream admission (`SessionStreams.admit`) answers this without a response schema, and so
  // does the default rate limit before it: a schema would reorder the limiter's body.
  429: {
    description:
      'Too many requests: the caller has as many open Session event streams as allowed, or the ' +
      'source exceeded the Runtime default rate limit (then the body also has `statusCode: 429` ' +
      'and the `x-ratelimit-*` headers are set).',
    headers: {
      'Retry-After':
        'Seconds to wait: `5` when the stream limit refused, the window reset when the default ' +
        'rate limit refused.',
    },
    contract: RateLimitedErrorResponseSchema,
  },
};
