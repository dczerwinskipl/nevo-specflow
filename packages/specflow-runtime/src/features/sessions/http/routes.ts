import type { FastifyInstance, FastifyRequest, RawServerBase } from 'fastify';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { Type } from 'typebox';
import {
  SessionCapabilities,
  CreateSessionSchema,
  StartTurnSchema,
  CancelTurnSchema,
  RespondInteractionSchema,
  SessionIdSchema,
  SessionSnapshotSchema,
  HistoryPageSchema,
  WorkPageSchema,
  ActionPageSchema,
  ContentPageSchema,
  ProviderCatalogueSchema,
  SessionLimits,
  type CreateSession,
  type StartTurn,
  type RespondInteraction,
  type SessionSnapshot,
  type SessionChange,
  type LiveProjection,
  type ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import type { EventBatch } from '../persistence/protocol';
import { SessionError } from '../errors';

const closed = { additionalProperties: false } as const;
const params = (extra: Record<string, typeof SessionIdSchema> = {}) =>
  Type.Object({ sessionId: SessionIdSchema, ...extra }, closed);
const pageQuery = Type.Object(
  {
    before: Type.Optional(Type.String({ maxLength: 2048 })),
    limit: Type.Optional(Type.String({ pattern: '^[1-9][0-9]?$' })),
  },
  closed,
);
interface Params {
  sessionId: string;
  turnId?: string;
  workId?: string;
  contentId?: string;
  interactionId?: string;
}
interface Query {
  before?: string;
  limit?: string;
  revision?: string;
  offset?: string;
  limitBytes?: string;
  after?: string;
}
const query = (request: FastifyRequest) => request.query as Query;
const ids = (request: FastifyRequest) => request.params as Params;
const count = (value: string | undefined, fallback: number, max: number) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new SessionError('SESSION_INPUT_INVALID', 'Page limit is out of range.');
  return n;
};
function effective(
  s: SessionSnapshot,
  request: FastifyRequest,
  providerFor: (providerId: string) => ProviderDescriptor | undefined,
): SessionSnapshot {
  const provider = providerFor(s.session.providerId);
  const available = provider?.readiness === 'ready';
  const permissions = request.authz.resolveCapabilities({
    resource: SessionCapabilities,
    scope: { projectId: s.session.projectId, sessionId: s.session.sessionId },
  });
  s.session.capabilities.view = permissions.view;
  s.session.capabilities.manage = permissions.manage;
  s.session.capabilities.questions = provider?.capabilities.questions === true;
  s.session.capabilities.permissions = provider?.capabilities.permissions === true;
  s.session.capabilities.start = permissions.manage && available && s.session.readiness === 'ready';
  s.session.capabilities.cancel =
    permissions.manage && !!s.activeTurn && s.activeTurn.state !== 'unknown';
  if (!available && !s.activeTurn) s.session.readiness = 'unavailable';
  return s;
}
function effectiveEvent(
  event: SessionChange,
  request: FastifyRequest,
  available: (providerId: string) => ProviderDescriptor | undefined,
): SessionChange {
  if (event.kind === 'session') {
    const session = event.changes.session;
    effective(
      { session, revision: 0, eventSeq: event.eventSeq, entries: [], history: { hasOlder: false } },
      request,
      available,
    );
  } else if ('projection' in event.changes && event.changes.projection) {
    const p: LiveProjection = event.changes.projection;
    effective(
      {
        session: p.session,
        revision: 0,
        eventSeq: event.eventSeq,
        entries: [],
        history: { hasOlder: false },
        ...(p.activeTurn ? { activeTurn: p.activeTurn } : {}),
        ...(p.currentActivity ? { currentActivity: p.currentActivity } : {}),
        ...(p.interaction ? { interaction: p.interaction } : {}),
      },
      request,
      available,
    );
  }
  return event;
}

export function registerSessionRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: {
    coordinator?: SessionCoordinator;
    projectId?: string;
  },
): void {
  const streams = new Set<AbortController>();
  const perActor = new Map<string, number>();
  app.addHook('preClose', (done) => {
    for (const controller of streams) controller.abort();
    done();
  });
  app.register((feature, _options, registered) => {
    feature.setErrorHandler((error, _request, reply) => {
      if (error instanceof SessionError)
        return reply
          .header('Cache-Control', 'no-store')
          .code(error.statusCode)
          .send({
            error: 'session_error',
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          });
      if (
        typeof error === 'object' &&
        error !== null &&
        ('validation' in error || ('code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'))
      ) {
        const tooLarge = 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE';
        return reply
          .header('Cache-Control', 'no-store')
          .code(tooLarge ? 413 : 400)
          .send({
            error: 'session_error',
            code: tooLarge ? 'SESSION_PAYLOAD_TOO_LARGE' : 'SESSION_INPUT_INVALID',
            message: tooLarge ? 'Request exceeds byte budget.' : 'Invalid Session request.',
          });
      }
      throw error;
    });
    feature.addHook('onSend', (_request, reply, _payload, done) => {
      reply.header('Cache-Control', 'no-store');
      done();
    });
    const coordinator = () => {
      if (!options.coordinator)
        throw new SessionError('SESSION_DISABLED', 'Managed Sessions are disabled.');
      return options.coordinator;
    };
    async function authorize(request: FastifyRequest, manage = false) {
      request.authz.requireAccess();
      const c = coordinator();
      request.authz.requireCapabilityInAnyScope({
        resource: SessionCapabilities,
        capability: manage
          ? SessionCapabilities.capabilities.Manage
          : SessionCapabilities.capabilities.View,
      });
      const identity = await c.store.call<{ projectId: string; sessionId: string }>({
        op: 'identity',
        sessionId: ids(request).sessionId,
      });
      request.authz.require({
        resource: SessionCapabilities,
        capability: manage
          ? SessionCapabilities.capabilities.Manage
          : SessionCapabilities.capabilities.View,
        scope: identity,
      });
    }
    function authorizeCreate(
      request: FastifyRequest,
      _reply: unknown,
      done: (error?: Error) => void,
    ) {
      request.authz.requireAccess();
      coordinator();
      request.authz.require({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.Create,
        scope: { projectId: options.projectId! },
      });
      done();
    }
    const actor = (request: FastifyRequest) => request.authz.readContext().subject;
    feature.get(
      '/api/session-providers',
      { preHandler: authorizeCreate, schema: { response: { 200: ProviderCatalogueSchema } } },
      async () => ({ items: await coordinator().providers() }),
    );
    feature.post(
      '/api/sessions',
      { bodyLimit: 256 * 1024, preHandler: authorizeCreate, schema: { body: CreateSessionSchema } },
      async (request, reply) => {
        return reply
          .code(201)
          .send(await coordinator().create(actor(request), request.body as CreateSession));
      },
    );
    feature.get(
      '/api/sessions/:sessionId',
      {
        preHandler: (request) => authorize(request),
        schema: { params: params(), response: { 200: SessionSnapshotSchema } },
      },
      async (request) =>
        effective(
          await coordinator().snapshot(ids(request).sessionId, actor(request)),
          request,
          coordinator().provider,
        ),
    );
    feature.get(
      '/api/sessions/:sessionId/history',
      {
        preHandler: (request) => authorize(request),
        schema: { params: params(), querystring: pageQuery, response: { 200: HistoryPageSchema } },
      },
      async (request) => {
        const q = query(request);
        if (!q.before)
          throw new SessionError(
            'SESSION_CURSOR_INVALID',
            'History requires a cursor from the Session snapshot.',
          );
        return coordinator().store.call({
          op: 'history',
          sessionId: ids(request).sessionId,
          actor: actor(request),
          before: q.before,
          limit: count(q.limit, 40, 40),
        });
      },
    );
    feature.get(
      '/api/sessions/:sessionId/turns/:turnId/work',
      {
        preHandler: (request) => authorize(request),
        schema: {
          params: params({ turnId: SessionIdSchema }),
          querystring: pageQuery,
          response: { 200: WorkPageSchema },
        },
      },
      (request) =>
        coordinator().store.call({
          op: 'work',
          sessionId: ids(request).sessionId,
          turnId: ids(request).turnId!,
          actor: actor(request),
          before: query(request).before,
          limit: count(query(request).limit, 40, 40),
        }),
    );
    feature.get(
      '/api/sessions/:sessionId/work/:workId/actions',
      {
        preHandler: (request) => authorize(request),
        schema: {
          params: params({ workId: SessionIdSchema }),
          querystring: pageQuery,
          response: { 200: ActionPageSchema },
        },
      },
      (request) =>
        coordinator().store.call({
          op: 'actions',
          sessionId: ids(request).sessionId,
          workId: ids(request).workId!,
          actor: actor(request),
          before: query(request).before,
          limit: count(query(request).limit, 40, 40),
        }),
    );
    feature.get(
      '/api/sessions/:sessionId/content/:contentId',
      {
        preHandler: (request) => authorize(request),
        schema: {
          params: params({ contentId: SessionIdSchema }),
          querystring: Type.Object(
            {
              revision: Type.String({ pattern: '^[0-9]+$', maxLength: 16 }),
              offset: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 16 })),
              limitBytes: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 6 })),
            },
            closed,
          ),
          response: { 200: ContentPageSchema },
        },
      },
      (request) =>
        coordinator().store.call({
          op: 'content',
          sessionId: ids(request).sessionId,
          contentId: ids(request).contentId!,
          revision: query(request).revision!,
          offset: Number(query(request).offset ?? 0),
          limitBytes: count(query(request).limitBytes, 65536, 65536),
        }),
    );
    feature.post(
      '/api/sessions/:sessionId/turns',
      {
        bodyLimit: 256 * 1024,
        preHandler: (request) => authorize(request, true),
        schema: { params: params(), body: StartTurnSchema },
      },
      async (request, reply) => {
        return reply
          .code(202)
          .send(
            await coordinator().start(
              actor(request),
              ids(request).sessionId,
              request.body as StartTurn,
            ),
          );
      },
    );
    feature.post(
      '/api/sessions/:sessionId/turns/:turnId/cancel',
      {
        bodyLimit: 65536,
        preHandler: (request) => authorize(request, true),
        schema: { params: params({ turnId: SessionIdSchema }), body: CancelTurnSchema },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await coordinator().cancel(
              actor(request),
              ids(request).sessionId,
              ids(request).turnId!,
              (request.body as { requestId: string }).requestId,
            ),
          ),
    );
    feature.post(
      '/api/sessions/:sessionId/interactions/:interactionId/respond',
      {
        bodyLimit: 65536,
        preHandler: (request) => authorize(request, true),
        schema: {
          params: params({ interactionId: SessionIdSchema }),
          body: RespondInteractionSchema,
        },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await coordinator().respond(
              actor(request),
              ids(request).sessionId,
              ids(request).interactionId!,
              request.body as RespondInteraction,
            ),
          ),
    );
    feature.get(
      '/api/sessions/:sessionId/events',
      {
        preHandler: (request) => authorize(request),
        schema: {
          params: params(),
          querystring: Type.Object(
            { after: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 16 })) },
            closed,
          ),
        },
      },
      async (request, reply) => {
        const sid = ids(request).sessionId,
          principal = actor(request),
          header = request.headers['last-event-id'];
        if (
          Array.isArray(header) ||
          (query(request).after !== undefined &&
            header !== undefined &&
            query(request).after !== header)
        )
          throw new SessionError('SESSION_CURSOR_INVALID', 'Conflicting replay cursors.');
        const supplied = query(request).after ?? header;
        const initial = await coordinator().store.call<EventBatch>({
          op: 'events',
          sessionId: sid,
          after: 0,
        });
        let after = supplied === undefined ? initial.latest : Number(supplied);
        if (!Number.isSafeInteger(after) || after < 0 || after > initial.latest)
          throw new SessionError('SESSION_CURSOR_INVALID', 'Invalid replay sequence.');
        if (streams.size >= 32 || (perActor.get(principal) ?? 0) >= 8)
          return reply.code(429).header('Retry-After', '5').send({ error: 'rate_limited' });
        const controller = new AbortController();
        streams.add(controller);
        perActor.set(principal, (perActor.get(principal) ?? 0) + 1);
        const raw = reply.raw;
        reply.hijack();
        const disconnected = () => controller.abort();
        raw.on('close', disconnected);
        raw.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        raw.write(': connected\n\n');
        let heartbeat = Date.now();
        try {
          while (!controller.signal.aborted) {
            request.authz = request.authz.refresh();
            await authorize(request);
            const batch = await coordinator().store.call<EventBatch>({
              op: 'events',
              sessionId: sid,
              after,
            });
            if (after < batch.oldest - 1 || raw.writableLength > SessionLimits.subscriberBytes) {
              raw.write('event: resync-required\ndata: {}\n\n');
              break;
            }
            for (const event of batch.events) {
              if (event.eventSeq !== after + 1) {
                raw.write('event: resync-required\ndata: {}\n\n');
                controller.abort();
                break;
              }
              const frame =
                'id: ' +
                event.eventSeq +
                '\nevent: session-change\ndata: ' +
                JSON.stringify(effectiveEvent(event, request, coordinator().provider)) +
                '\n\n';
              if (!raw.write(frame)) await once(raw, 'drain', { signal: controller.signal });
              after = event.eventSeq;
            }
            if (Date.now() - heartbeat >= 15000) {
              raw.write(': heartbeat\n\n');
              heartbeat = Date.now();
            }
            if (!batch.events.length) await delay(100, undefined, { signal: controller.signal });
          }
        } catch {
          /* Auth revocation, disconnect and shutdown close the stream without more data. */
        } finally {
          streams.delete(controller);
          const left = (perActor.get(principal) ?? 1) - 1;
          if (left) perActor.set(principal, left);
          else perActor.delete(principal);
          raw.off('close', disconnected);
          if (!raw.writableEnded) raw.end();
        }
      },
    );
    registered();
  });
}
