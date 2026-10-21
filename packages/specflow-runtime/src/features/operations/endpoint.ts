import {
  OperationKindQuerySchema,
  OperationProgressParamsSchema,
  type OperationKind,
} from '@nevo/specflow-contracts/operations';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import type { OperationKindRegistration } from './kind-registration';
import {
  DEFAULT_PROGRESS_WAIT_MS,
  type OperationProgressRegistry,
  type StoredProgressEvent,
} from './progress-registry';

export const DEFAULT_PROGRESS_HEARTBEAT_MS = 15_000;

export interface OperationProgressEndpointOptions {
  readonly registry: OperationProgressRegistry;
  readonly kinds: readonly OperationKindRegistration[];
  readonly heartbeatMs?: number;
  readonly waitMs?: number;
}

/**
 * `GET /api/operations/:operationId/events?kind=<kind>`: kind-agnostic Server-Sent Events stream
 * of a long-running operation. The kind selects the authorization (owned by the kind's feature)
 * before anything about the operation is revealed.
 */
export const operationProgressEndpoint: FastifyPluginCallback<OperationProgressEndpointOptions> = (
  app,
  options,
  done,
) => {
  const kinds = new Map<OperationKind, OperationKindRegistration>(
    options.kinds.map((registration) => [registration.kind, registration]),
  );
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_PROGRESS_HEARTBEAT_MS;
  const waitMs = options.waitMs ?? DEFAULT_PROGRESS_WAIT_MS;
  const open = new Set<AbortController>();

  app.addHook('preClose', (closed) => {
    for (const controller of open) controller.abort();
    closed();
  });

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/operations/:operationId/events',
    {
      preHandler: async (request) => {
        const registration = kinds.get((request.query as { kind: OperationKind }).kind);
        if (!registration) {
          // Unregistered kind: same shape as an unauthorized one, nothing is revealed.
          request.authz.requireAccess();
          throw Object.assign(new Error('Unknown operation kind.'), { statusCode: 404 });
        }
        await registration.authorize(request);
      },
      schema: {
        params: OperationProgressParamsSchema,
        querystring: OperationKindQuerySchema,
        response: {
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { operationId } = request.params;
      const { kind } = request.query;
      const lastEventId = parseLastEventId(request.headers['last-event-id']);

      const controller = new AbortController();
      open.add(controller);
      reply.hijack();
      const raw = reply.raw;
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
        for await (const item of options.registry.watch(operationId, kind, {
          ...(lastEventId !== undefined ? { lastEventId } : {}),
          waitMs,
          signal: controller.signal,
        })) {
          if (raw.writableEnded || raw.destroyed) break;
          raw.write(frame(item));
        }
      } finally {
        clearInterval(heartbeat);
        open.delete(controller);
        if (!raw.writableEnded) raw.end();
      }
    },
  );
  done();
};

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
