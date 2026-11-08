import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import {
  SessionCapabilities,
  SessionIdSchema,
  RenameSessionSchema,
  ArchiveSessionSchema,
  SessionCommandResultSchema,
  type RenameSession,
  type ArchiveSession,
} from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import type { SessionView } from '../persistence/protocol';
import { authorizeSessionCapability, sessionIdentity } from './authorization';
import { effective } from './projection';

const params = Type.Object({ sessionId: SessionIdSchema }, { additionalProperties: false });
const sessionId = (request: FastifyRequest) => (request.params as { sessionId: string }).sessionId;
const actor = (request: FastifyRequest) => request.authz.readContext().subject;

/** Rename, archive, unarchive and delete. Persistence rules live in the Session store. */
export function registerSessionManagementRoutes(
  feature: FastifyInstance,
  coordinator: () => SessionCoordinator,
): void {
  const authorize = (capability: 'manage' | 'delete') => async (request: FastifyRequest) => {
    await authorizeSessionCapability(
      request,
      coordinator(),
      sessionId(request),
      capability === 'delete'
        ? SessionCapabilities.capabilities.Delete
        : SessionCapabilities.capabilities.Manage,
    );
  };

  const project = async (view: SessionView, request: FastifyRequest) => ({
    session: effective(
      {
        session: view.session,
        revision: 0,
        eventSeq: 0,
        entries: [],
        history: { hasOlder: false },
        ...(view.activeTurn ? { activeTurn: view.activeTurn } : {}),
      },
      request,
      coordinator().provider,
      await sessionIdentity(coordinator(), view.session.sessionId),
    ).session,
  });
  const command = (
    path: string,
    body: typeof RenameSessionSchema | typeof ArchiveSessionSchema,
    run: (request: FastifyRequest) => Promise<SessionView>,
  ) =>
    feature.post(
      '/api/sessions/:sessionId/' + path,
      {
        bodyLimit: 65536,
        preHandler: authorize('manage'),
        schema: { params, body, response: { 200: SessionCommandResultSchema } },
      },
      async (request) => project(await run(request), request),
    );

  command('rename', RenameSessionSchema, (request) =>
    coordinator().rename(actor(request), sessionId(request), request.body as RenameSession),
  );
  command('archive', ArchiveSessionSchema, (request) =>
    coordinator().archive(actor(request), sessionId(request), request.body as ArchiveSession),
  );
  command('unarchive', ArchiveSessionSchema, (request) =>
    coordinator().unarchive(actor(request), sessionId(request), request.body as ArchiveSession),
  );
  feature.delete(
    '/api/sessions/:sessionId',
    { preHandler: authorize('delete'), schema: { params } },
    async (request, reply) => {
      await coordinator().remove(sessionId(request));

      return reply.code(204).send();
    },
  );
}
