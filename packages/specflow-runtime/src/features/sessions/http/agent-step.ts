import type { FastifyRequest } from 'fastify';
import type { AgentStepOrigin } from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';

import { specScope } from '../../specs';
import type { SessionScopeIdentity } from '../scope';

/**
 * The agent step attempt each agent step execution Session of a Specification was made for, by
 * Session id (the agent-execution feature reads it from the committed attempt records).
 */
export type AgentStepOrigins = (specId: string) => Promise<ReadonlyMap<string, AgentStepOrigin>>;

/** The `agentStep` of one Session read, bound to the request's caller. */
export type AgentStepOf = (
  request: FastifyRequest,
  identity: SessionScopeIdentity,
) => Promise<AgentStepOrigin | undefined>;

/**
 * The `agentStep` of a Session for its reader: only a Session of a Specification, only to a caller
 * who may view that Specification (the step and Task titles are the Specification's). It is
 * presentational: an origin that cannot be read is left out, never a failed read.
 */
export function agentStepReader(origins: AgentStepOrigins | undefined): AgentStepOf {
  return async (request, identity) => {
    const specId = identity.specId;
    if (
      !origins ||
      specId === undefined ||
      !request.authz.can({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
        scope: specScope(identity.projectId, specId),
      })
    ) {
      return undefined;
    }

    try {
      return (await origins(specId)).get(identity.sessionId);
    } catch {
      return undefined;
    }
  };
}
