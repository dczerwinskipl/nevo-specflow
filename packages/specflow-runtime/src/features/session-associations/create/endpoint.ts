import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  CreateContextSessionResultSchema,
  CreateContextSessionSchema,
  SessionCapabilities,
  SessionErrorSchema,
  type CreateContextSession,
} from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  SpecificationReadErrorSchema,
  SpecificationWorkspaceParamsSchema,
} from '@nevo/specflow-contracts/specs/workspace';
import { SessionError, authorizeSessionWrite, type SessionsRuntime } from '../../sessions';
import { specScope, type ProjectIdSource } from '../../specs';
import type { AssociationTargets } from '../targets';
import { createContextSession } from './create-context-session';

const specIdOf = (request: FastifyRequest) => (request.params as { specId: string }).specId;

/**
 * `POST /api/specs/:specId/sessions`. Refusal precedence: authentication, `SESSION_DISABLED`, then
 * the capability checks (`spec.start-session` at `specScope`, `session.create` at
 * `{projectId, specId}`, `session.execute-write` at `{projectId}` for write mode), and only then
 * the Engine verification, so a refused caller never learns whether the Specification exists.
 */
export function registerCreateContextSessionRoute(
  feature: FastifyInstance,
  options: { sessions: SessionsRuntime; targets: AssociationTargets; projectId: ProjectIdSource },
): void {
  const coordinator = () => {
    if (!options.sessions.coordinator) {
      throw new SessionError('SESSION_DISABLED', 'Managed Sessions are disabled.');
    }

    return options.sessions.coordinator;
  };

  function authorize(request: FastifyRequest, _reply: unknown, done: (error?: Error) => void) {
    request.authz.requireAccess();
    coordinator();
    const specId = specIdOf(request);
    const projectId = options.sessions.projectId!;
    request.authz.require({
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.StartSession,
      scope: specScope(options.projectId(), specId),
    });
    request.authz.require({
      resource: SessionCapabilities,
      capability: SessionCapabilities.capabilities.Create,
      scope: { projectId, specId },
    });
    if ((request.body as CreateContextSession | undefined)?.mode === 'workspace-write') {
      // Never Specification-scoped: the provider cwd is the whole project workspace.
      authorizeSessionWrite(request, { projectId });
    }

    done();
  }

  feature.withTypeProvider<TypeBoxTypeProvider>().post(
    '/api/specs/:specId/sessions',
    {
      bodyLimit: 256 * 1024,
      preHandler: authorize,
      schema: {
        params: SpecificationWorkspaceParamsSchema,
        body: CreateContextSessionSchema,
        response: {
          201: CreateContextSessionResultSchema,
          404: SpecificationReadErrorSchema,
          // Either envelope: the Specification source error or a `session_error`.
          503: Type.Union([SpecificationReadErrorSchema, SessionErrorSchema]),
        },
      },
    },
    async (request, reply) => {
      const outcome = await createContextSession(
        { coordinator: coordinator(), targets: options.targets },
        request.authz.readContext().subject,
        request.params.specId,
        request.body,
      );
      if (outcome.kind === 'created') {
        return reply.code(201).send(outcome.value);
      }

      if (outcome.kind === 'source_unavailable') {
        return reply.code(503).send({ error: 'specification_source_unavailable' });
      }

      return reply.code(404).send({ error: outcome.kind });
    },
  );
}
