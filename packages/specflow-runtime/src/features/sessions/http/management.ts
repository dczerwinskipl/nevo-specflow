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
import { authorizeSessionCapability, authorizedIdentity } from './authorization';
import { effective } from './projection';
import { contractRef } from '../../../server/shared-contracts';
import { capabilityRefusal, sessionRouteErrors } from './route-docs';

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

  const project = (view: SessionView, request: FastifyRequest) => ({
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
      authorizedIdentity(request, view.session.sessionId),
    ).session,
  });
  const command = (
    path: string,
    summary: string,
    errors: (typeof sessionRouteErrors)['manage'],
    body: typeof RenameSessionSchema | typeof ArchiveSessionSchema,
    run: (request: FastifyRequest) => Promise<SessionView>,
  ) =>
    feature.post(
      '/api/sessions/:sessionId/' + path,
      {
        bodyLimit: 65536,
        preHandler: authorize('manage'),
        config: { openApiResponses: errors },
        schema: {
          tags: ['Sessions'],
          summary,
          params,
          body,
          response: { 200: contractRef(SessionCommandResultSchema), ...capabilityRefusal },
        },
      },
      async (request) => project(await run(request), request),
    );

  command('rename', 'Rename a Session', sessionRouteErrors.manage, RenameSessionSchema, (request) =>
    coordinator().rename(actor(request), sessionId(request), request.body as RenameSession),
  );
  command(
    'archive',
    'Archive a Session',
    sessionRouteErrors.archive,
    ArchiveSessionSchema,
    (request) =>
      coordinator().archive(actor(request), sessionId(request), request.body as ArchiveSession),
  );
  command(
    'unarchive',
    'Unarchive a Session',
    sessionRouteErrors.manage,
    ArchiveSessionSchema,
    (request) =>
      coordinator().unarchive(actor(request), sessionId(request), request.body as ArchiveSession),
  );
  // The handler answers `204` only; the `403` of the response schema comes from the preHandler.
  feature.delete<{ Reply: { 204: undefined } }>(
    '/api/sessions/:sessionId',
    {
      preHandler: authorize('delete'),
      config: {
        openApiResponses: {
          204: { description: 'The Session is deleted. No body.' },
          ...sessionRouteErrors.delete,
        },
      },
      schema: {
        tags: ['Sessions'],
        summary: 'Delete a Session',
        params,
        response: capabilityRefusal,
      },
    },
    async (request, reply) => {
      await coordinator().remove(sessionId(request));

      return reply.code(204).send();
    },
  );
}
