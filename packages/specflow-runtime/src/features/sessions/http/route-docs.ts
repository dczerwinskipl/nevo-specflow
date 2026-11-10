import { AuthorizationForbiddenErrorResponseSchema } from '@nevo/specflow-contracts/authorization';

import type { OpenApiDocumentedResponse } from '../../../server/openapi';
import { contractRef } from '../../../server/shared-contracts';

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
};
