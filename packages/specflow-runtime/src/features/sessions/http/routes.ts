import type { FastifyInstance, FastifyRequest, RawServerBase } from 'fastify';
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
  type CreateSession,
  type StartTurn,
  type RespondInteraction,
} from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import { SessionError } from '../errors';
import { effective } from './projection';
import { authorizeSession, authorizeSessionWrite } from './authorization';
import { createSessionStreams } from './stream';
import { registerTelemetryRoutes } from './telemetry';

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
  if (!Number.isSafeInteger(n) || n < 1 || n > max) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Page limit is out of range.');
  }

  return n;
};

export function registerSessionRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: {
    coordinator?: SessionCoordinator;
    projectId?: string;
  },
): void {
  const streams = createSessionStreams(app);
  app.register((feature, _options, registered) => {
    feature.setErrorHandler((error, _request, reply) => {
      if (error instanceof SessionError) {
        return reply
          .header('Cache-Control', 'no-store')
          .code(error.statusCode)
          .send({
            error: 'session_error',
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          });
      }

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
      if (!reply.hasHeader('Cache-Control')) {
        reply.header('Cache-Control', 'no-store');
      }

      done();
    });
    const coordinator = () => {
      if (!options.coordinator) {
        throw new SessionError('SESSION_DISABLED', 'Managed Sessions are disabled.');
      }

      return options.coordinator;
    };

    const authorize = (request: FastifyRequest, manage = false) =>
      authorizeSession(request, coordinator(), ids(request).sessionId, manage);
    async function authorizeExecution(request: FastifyRequest, continuation = false) {
      await authorize(request, true);
      const response = request.body as RespondInteraction;
      if (continuation && response.kind === 'permission' && response.decision === 'deny') {
        return;
      }

      const snapshot = await coordinator().snapshot(
        ids(request).sessionId,
        request.authz.readContext().subject,
      );
      const mode = continuation
        ? (snapshot.activeTurn?.mode ?? snapshot.session.mode)
        : ((request.body as StartTurn).mode ?? snapshot.session.mode);
      if (mode === 'workspace-write') {
        authorizeSessionWrite(request, {
          projectId: snapshot.session.projectId,
          sessionId: snapshot.session.sessionId,
        });
      }
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
      if ((request.body as CreateSession | undefined)?.mode === 'workspace-write') {
        authorizeSessionWrite(request, { projectId: options.projectId! });
      }

      done();
    }

    const actor = (request: FastifyRequest) => request.authz.readContext().subject;
    registerTelemetryRoutes(feature, coordinator);
    feature.get(
      '/api/session-providers',
      { preHandler: authorizeCreate, schema: { response: { 200: ProviderCatalogueSchema } } },
      async (request) => {
        const items = await coordinator().providers();
        const permissions = request.authz.resolveCapabilities({
          resource: SessionCapabilities,
          scope: { projectId: options.projectId! },
        });
        for (const provider of items) {
          if (provider.providerModes) {
            provider.providerModes = provider.providerModes.map((mode) => ({
              ...mode,
              authorized: mode.mode !== 'workspace-write' || permissions['execute-write'],
            }));
          }
        }

        return { items };
      },
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
        if (!q.before) {
          throw new SessionError(
            'SESSION_CURSOR_INVALID',
            'History requires a cursor from the Session snapshot.',
          );
        }

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
        preHandler: (request) => authorizeExecution(request),
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
      '/api/sessions/:sessionId/turns/:turnId/reconcile',
      {
        bodyLimit: 65536,
        preHandler: (request) => authorize(request, true),
        schema: { params: params({ turnId: SessionIdSchema }), body: CancelTurnSchema },
      },
      async (request, reply) =>
        reply
          .code(200)
          .send(
            await coordinator().reconcile(
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
        preHandler: (request) => authorizeExecution(request, true),
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
        return streams.open(
          request,
          reply,
          coordinator(),
          ids(request).sessionId,
          actor(request),
          query(request).after,
        );
      },
    );
    registered();
  });
}
