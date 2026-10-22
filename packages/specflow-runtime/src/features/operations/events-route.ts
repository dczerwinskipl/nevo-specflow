import { OperationProgressParamsSchema } from '@nevo/specflow-contracts/operations';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ServerResponse } from 'node:http';

import { Type } from 'typebox';

import type { FastifyInstance, FastifyRequest, RawServerBase } from 'fastify';

import {
  DEFAULT_PROGRESS_WAIT_MS,
  type OperationProgressRegistry,
  type StoredProgressEvent,
} from './progress-registry';

export const DEFAULT_PROGRESS_HEARTBEAT_MS = 15_000;

/** Tuning of the SSE stream (tests shorten both). */
export interface OperationEventsStreamOptions {
  readonly heartbeatMs?: number;
  readonly waitMs?: number;
  /** Open streams of this route, all principals together (default 200). */
  readonly maxStreams?: number;
  /** Open streams of one principal (default 20). */
  readonly maxStreamsPerPrincipal?: number;
  /** Streams of ids this Runtime does not know (yet) that may wait at the same time (default 20). */
  readonly maxWaiting?: number;
}

export const DEFAULT_MAX_STREAMS = 200;
export const DEFAULT_MAX_STREAMS_PER_PRINCIPAL = 20;
export const DEFAULT_MAX_WAITING_STREAMS = 20;
/** Code of a refused stream (a `Retry-After` header is sent too). */
export const OPERATION_STREAMS_LIMIT_CODE = 'OPERATION_STREAMS_LIMIT';
const RETRY_AFTER_SECONDS = 5;

export interface OperationEventsRoute {
  /** Route path owned by the feature; must contain the `:operationId` parameter. */
  readonly path: string;
  /** The operation kind (a key of the contracts registry) this route streams. */
  readonly kind: string;
  /**
   * Same authentication and authorization as the feature's inspection endpoint. Runs before
   * anything about the operation is revealed; throws an auth error (rendered by the Runtime).
   */
  authorize(request: FastifyRequest): void | Promise<void>;
  readonly registry: OperationProgressRegistry;
  readonly stream?: OperationEventsStreamOptions;
}

/**
 * Registers `GET <path>`: the Server-Sent Events stream of one long-running operation of one kind.
 * The routing, authorization and URL belong to the owning feature (next to its inspection
 * endpoint); everything else (framing, replay with `Last-Event-ID`, heartbeat, closing after the
 * terminal event, shutdown) is this shared mechanism. Adding progress to another operation is one
 * call of this helper plus an adapter that feeds the registry.
 */
export function registerOperationEventsRoute<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  route: OperationEventsRoute,
): void {
  const heartbeatMs = route.stream?.heartbeatMs ?? DEFAULT_PROGRESS_HEARTBEAT_MS;
  const waitMs = route.stream?.waitMs ?? DEFAULT_PROGRESS_WAIT_MS;
  const open = new Set<AbortController>();
  const maxStreams = route.stream?.maxStreams ?? DEFAULT_MAX_STREAMS;
  const maxPerPrincipal = route.stream?.maxStreamsPerPrincipal ?? DEFAULT_MAX_STREAMS_PER_PRINCIPAL;
  const maxWaiting = route.stream?.maxWaiting ?? DEFAULT_MAX_WAITING_STREAMS;
  const perPrincipal = new Map<string, number>();
  let waiting = 0;

  app.addHook('preClose', (closed) => {
    for (const controller of open) controller.abort();
    closed();
  });

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    route.path,
    {
      preHandler: async (request) => {
        // The Runtime serves HTTP/1 only; the generic RawServer is just the caller's app type.
        await route.authorize(request as unknown as FastifyRequest);
      },
      schema: {
        params: OperationProgressParamsSchema,
        response: {
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
          429: Type.Object(
            { error: Type.String(), code: Type.String() },
            { additionalProperties: false },
          ),
        },
      },
    },
    async (request, reply) => {
      const { operationId } = request.params;
      const lastEventId = parseLastEventId(request.headers['last-event-id']);

      const principal = principalOf(request as unknown as FastifyRequest);
      const known = route.registry.peek(operationId, route.kind) !== undefined;
      // Every open stream holds a socket, a heartbeat timer and an abort listener, and an unknown
      // id additionally waits up to `waitMs`: all three are bounded.
      if (
        open.size >= maxStreams ||
        (perPrincipal.get(principal) ?? 0) >= maxPerPrincipal ||
        (!known && waiting >= maxWaiting)
      ) {
        return reply
          .code(429)
          .header('Retry-After', String(RETRY_AFTER_SECONDS))
          .header('Cache-Control', 'no-store')
          .send({ error: OPERATION_STREAMS_LIMIT_CODE, code: OPERATION_STREAMS_LIMIT_CODE });
      }
      let holdsWaitingSlot = !known;
      const releaseWaiting = () => {
        if (holdsWaitingSlot) {
          holdsWaitingSlot = false;
          waiting -= 1;
        }
      };
      if (holdsWaitingSlot) waiting += 1;
      perPrincipal.set(principal, (perPrincipal.get(principal) ?? 0) + 1);

      const controller = new AbortController();
      open.add(controller);
      reply.hijack();
      const raw = reply.raw as ServerResponse;
      raw.on('close', () => controller.abort());
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      raw.write('retry: 3000\n\n');
      const heartbeat = setInterval(() => {
        if (!raw.writableEnded) raw.write(': heartbeat\n\n');
      }, heartbeatMs);

      try {
        for await (const item of route.registry.watch(operationId, route.kind, {
          ...(lastEventId !== undefined ? { lastEventId } : {}),
          waitMs,
          signal: controller.signal,
        })) {
          releaseWaiting();
          if (raw.writableEnded || raw.destroyed) break;
          raw.write(frame(item));
        }
      } finally {
        clearInterval(heartbeat);
        open.delete(controller);
        releaseWaiting();
        const left = (perPrincipal.get(principal) ?? 1) - 1;
        if (left <= 0) perPrincipal.delete(principal);
        else perPrincipal.set(principal, left);
        if (!raw.writableEnded) raw.end();
      }
    },
  );
}

/** Trusted identity of the caller (the route is authorized before this runs). */
function principalOf(request: FastifyRequest): string {
  try {
    return request.authz.readContext().subject;
  } catch {
    return 'anonymous';
  }
}

function frame(item: StoredProgressEvent): string {
  return (
    (item.id !== undefined ? `id: ${item.id}\n` : '') +
    `event: ${item.event.type}\n` +
    `data: ${JSON.stringify(item.event)}\n\n`
  );
}

function parseLastEventId(header: string | string[] | undefined): number | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !/^\d{1,12}$/.test(value)) return undefined;
  return Number(value);
}
