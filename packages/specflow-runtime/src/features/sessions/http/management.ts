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
import type { AgentStepOf } from './agent-step';
import { contractRef } from '../../../server/shared-contracts';
import { capabilityRefusal, sessionRouteErrors } from './route-docs';

const params = Type.Object({ sessionId: SessionIdSchema }, { additionalProperties: false });
const sessionId = (request: FastifyRequest) => (request.params as { sessionId: string }).sessionId;
const actor = (request: FastifyRequest) => request.authz.readContext().subject;

/** Rename, archive, unarchive and delete. Persistence rules live in the Session store. */
export function registerSessionManagementRoutes(
  feature: FastifyInstance,
  coordinator: () => SessionCoordinator,
  agentStepOf?: AgentStepOf,
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

  const project = async (view: SessionView, request: FastifyRequest) => {
    const identity = authorizedIdentity(request, view.session.sessionId);
    const session = effective(
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
      identity,
    ).session;
    const agentStep = await agentStepOf?.(request, identity);

    return { session: agentStep ? { ...session, agentStep } : session };
  };

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
          description:
            path === 'rename'
              ? 'Rename a Session without changing provider identity, Turn state or association. Requires session.manage; allowed even when archived. Nonblank title 1..256 characters. requestId replay is idempotent, changed title with same key conflicts.'
              : path === 'archive'
                ? 'Archive a Session after ensuring no Turn is nonterminal or unknown; never implicitly cancels a Turn. Archive is idempotent and retains original archivedAt. Archived Session is read-only except that history, telemetry and reads remain available.'
                : 'Unarchive the Session, preserving history, identity and Specification association. No-op if already active. Replaying the same requestId is idempotent; changed input conflicts.',
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
        description:
          'Hard-delete a Session and its Runtime-owned Turns, history, content, telemetry and associations as one transaction, without deleting provider-native or Engine execution records. Requires session.delete. Active or unknown Turn refuses 409 TURN_CONFLICT; detached unresolved write evidence is SESSION_DELETE_BLOCKED. Completed delete is 204; later reads and repeated delete give 404 SESSION_NOT_FOUND.',
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
