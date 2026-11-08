import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import {
  ActionPageSchema,
  ContentPageSchema,
  HistoryPageSchema,
  ProviderCatalogueSchema,
  SessionCapabilities,
  SessionIdSchema,
  SessionSnapshotSchema,
  TelemetrySnapshotSchema,
  WorkPageSchema,
  type ProviderDescriptor,
  type SessionSnapshot,
  type TelemetrySnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { DemoState } from '../../../demo/state';
import { SessionError } from '../errors';
import type { SessionListSource } from '../http/list';
import type { SessionAssociations } from '../reference-owner';
import type { SessionScopeIdentity } from '../scope';
import { authorizeSessionIdentity } from '../http/authorization';
import type { SessionStreams } from '../http/stream';

/**
 * The read side of the managed Session screen in demo mode. A demo Session (seeded in the
 * catalogue or allocated here) is shown read-only: the snapshot grants `view` and nothing else
 * and carries the list row's readiness,
 * there is no Turn, no history, no Work and no telemetry, and the event stream only heartbeats.
 * Every mutation stays refused with `SESSION_DISABLED` by the managed routes (no coordinator).
 */
export interface DemoManagedSessionReads {
  /** The demo Session's identity, or `SESSION_NOT_FOUND`. */
  identity(sessionId: string): Promise<SessionScopeIdentity>;
  snapshot(identity: SessionScopeIdentity): Promise<SessionSnapshot>;
  providers(): ProviderDescriptor[];
  readonly projectId: string;
}

const inert = {
  view: true,
  manage: false,
  start: false,
  cancel: false,
  questions: false,
  permissions: false,
  executeWrite: false,
  delete: false,
};

export function createDemoManagedSessionReads(options: {
  state: DemoState;
  list: SessionListSource;
  references: SessionAssociations;
}): DemoManagedSessionReads {
  const { state, list, references } = options;

  return {
    projectId: state.catalogue.project.id,
    async identity(sessionId) {
      // The association registry knows every seeded and allocated demo Session.
      return references.identity(sessionId);
    },
    async snapshot(identity) {
      const [summary] = await list.summaries([identity.sessionId]);
      if (!summary) {
        throw new SessionError('SESSION_NOT_FOUND', 'Session not found.');
      }

      return {
        session: {
          sessionId: identity.sessionId,
          projectId: identity.projectId,
          ...(summary.title ? { title: summary.title } : {}),
          providerId: summary.providerId,
          // The list row's catalogue titles: a viewer names the executor without the catalogue.
          ...(summary.providerTitle ? { providerTitle: summary.providerTitle } : {}),
          ...(summary.modelId ? { modelId: summary.modelId } : {}),
          ...(summary.modelTitle ? { modelTitle: summary.modelTitle } : {}),
          mode: 'read-only',
          // The list row's readiness, so the header says what the Sessions navigator says.
          readiness: summary.readiness,
          capabilities: { ...inert },
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        },
        revision: 0,
        eventSeq: 0,
        entries: [],
        history: { hasOlder: false },
      };
    },
    providers() {
      return state.catalogue.providers.map((provider) => ({
        providerId: provider.id,
        title: provider.title,
        readiness: provider.available ? ('ready' as const) : ('unavailable' as const),
        capabilities: {
          questions: false,
          permissions: false,
          cancel: false,
          resume: false,
          modelOverride: false,
          effortOverride: false,
        },
        models: provider.models.map((model) => ({
          modelId: model.id,
          title: model.title,
          efforts: [...model.efforts],
        })),
        modes: ['read-only' as const],
      }));
    },
  };
}

/** Telemetry the demo never observed: every reading unavailable, nothing refreshable. */
function unobservedTelemetry(sessionId: string): TelemetrySnapshot {
  const reading = {
    status: 'unavailable' as const,
    freshness: 'unknown' as const,
    reason: 'NOT_OBSERVED' as const,
    refreshable: false,
  };

  return {
    sessionId,
    revision: 0,
    accessRevision: 'demo',
    eventSeq: 0,
    usage: { session: reading },
    cost: { session: reading },
    limits: reading,
    context: reading,
    refresh: { state: 'idle', groups: [] },
  };
}

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
const sid = (request: FastifyRequest) => (request.params as { sessionId: string }).sessionId;
const HEARTBEAT_MS = 15000;

/**
 * Registers the demo read routes on the managed Session paths, in place of the coordinator's
 * reads. Authorization and the stream caps are the managed routes' own.
 */
export function registerDemoManagedSessionReads(
  feature: FastifyInstance,
  reads: DemoManagedSessionReads,
  streams: Pick<SessionStreams, 'admit'>,
): void {
  const authorize = (request: FastifyRequest) =>
    authorizeSessionIdentity(
      request,
      () => reads.identity(sid(request)),
      SessionCapabilities.capabilities.View,
    );

  const noResource = () => {
    throw new SessionError('SESSION_RESOURCE_NOT_FOUND', 'A demo Session has no Turns.');
  };

  feature.get(
    '/api/session-providers',
    { schema: { response: { 200: ProviderCatalogueSchema } } },
    (request) => {
      // As in project mode: the catalogue is what a Session creator chooses from.
      request.authz.requireAccess();
      request.authz.require({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.Create,
        scope: { projectId: reads.projectId },
      });

      return { items: reads.providers() };
    },
  );
  feature.get(
    '/api/sessions/:sessionId',
    { schema: { params: params(), response: { 200: SessionSnapshotSchema } } },
    async (request) => reads.snapshot(await authorize(request)),
  );
  feature.get(
    '/api/sessions/:sessionId/history',
    { schema: { params: params(), querystring: pageQuery, response: { 200: HistoryPageSchema } } },
    async (request) => {
      await authorize(request);
      if (!(request.query as { before?: string }).before) {
        throw new SessionError(
          'SESSION_CURSOR_INVALID',
          'History requires a cursor from the Session snapshot.',
        );
      }

      return { sessionId: sid(request), eventSeq: 0, entries: [], history: { hasOlder: false } };
    },
  );
  feature.get(
    '/api/sessions/:sessionId/turns/:turnId/work',
    {
      schema: {
        params: params({ turnId: SessionIdSchema }),
        querystring: pageQuery,
        response: { 200: WorkPageSchema },
      },
    },
    async (request) => {
      await authorize(request);

      return noResource();
    },
  );
  feature.get(
    '/api/sessions/:sessionId/work/:workId/actions',
    {
      schema: {
        params: params({ workId: SessionIdSchema }),
        querystring: pageQuery,
        response: { 200: ActionPageSchema },
      },
    },
    async (request) => {
      await authorize(request);

      return noResource();
    },
  );
  feature.get(
    '/api/sessions/:sessionId/content/:contentId',
    {
      schema: {
        params: params({ contentId: SessionIdSchema }),
        response: { 200: ContentPageSchema },
      },
    },
    async (request) => {
      await authorize(request);

      return noResource();
    },
  );
  feature.get(
    '/api/sessions/:sessionId/telemetry',
    { schema: { params: params(), response: { 200: TelemetrySnapshotSchema } } },
    async (request, reply) => {
      await authorize(request);
      reply.header('Cache-Control', 'private, no-cache');

      return unobservedTelemetry(sid(request));
    },
  );
  feature.get(
    '/api/sessions/:sessionId/events',
    {
      schema: {
        params: params(),
        querystring: Type.Object(
          { after: Type.Optional(Type.String({ pattern: '^[0-9]+$', maxLength: 16 })) },
          closed,
        ),
      },
    },
    async (request, reply) => {
      await authorize(request);
      const header = request.headers['last-event-id'];
      const after = (request.query as { after?: string }).after ?? header;
      // A demo Session never emits an event: only the snapshot's eventSeq 0 is a valid cursor.
      if (Array.isArray(header) || (after !== undefined && after !== '0')) {
        throw new SessionError('SESSION_CURSOR_INVALID', 'Invalid replay sequence.');
      }

      const admission = streams.admit(request.authz.readContext().subject);
      if (!admission) {
        return reply.code(429).header('Retry-After', '5').send({ error: 'rate_limited' });
      }

      heartbeat(reply, admission);
    },
  );
}

function heartbeat(
  reply: FastifyReply,
  admission: { controller: AbortController; release: () => void },
) {
  const raw = reply.raw;
  reply.hijack();
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  raw.write(': connected\n\n');
  const timer = setInterval(() => raw.write(': heartbeat\n\n'), HEARTBEAT_MS);
  const stop = () => {
    clearInterval(timer);
    admission.release();
    raw.off('close', stop);
    admission.controller.signal.removeEventListener('abort', stop);
    if (!raw.writableEnded) {
      raw.end();
    }
  };

  raw.on('close', stop);
  // Server shutdown aborts every admitted stream.
  admission.controller.signal.addEventListener('abort', stop, { once: true });
}
