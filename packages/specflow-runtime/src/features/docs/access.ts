import { DocsCapabilities } from '@nevo/specflow-contracts/docs';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { docsUnavailableBody } from './unavailable';

/** The Runtime's project id: `undefined` without an Engine (demo data, Runtimes without a project). */
export type DocsProjectId = () => string | undefined;

/**
 * Pre-handler of every docs route (ADR 0022 §2): `docs.view` at the Runtime's project scope
 * `{ projectId }`, never in any scope, so a grant bounded to a Specification or a Session admits no
 * documentation. It runs before the handler touches a workspace or the registry: `401` without
 * access, `503 DOCS_UNAVAILABLE` without a project, then `403`.
 */
export function requireDocsView(projectId: DocsProjectId) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    request.authz.requireAccess();
    const id = projectId();
    if (id === undefined) {
      // A pre-handler that sends ends the request; the route handler does not run.
      await reply.code(503).header('Cache-Control', 'no-store').send(docsUnavailableBody);

      return;
    }

    request.authz.require({
      resource: DocsCapabilities,
      capability: DocsCapabilities.capabilities.View,
      scope: { projectId: id },
    });
  };
}
