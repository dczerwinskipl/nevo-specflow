import { randomUUID } from 'node:crypto';

import { createAuthorization } from '@nevo/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { ActionProjection } from '@nevo/specflow-engine';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { RUNTIME_FASTIFY_OPTIONS } from '../../../server/app';
import { registerRuntimeErrorHandler } from '../../../server/error-handler';
import { registerSharedContracts } from '../../../server/shared-contracts';
import { createRequestAuthorization } from '../../auth/authorization/request-authorization';
import { SessionError } from '../../sessions';
import { AgentUnavailableError, demoAgentAvailability } from '../../workflow';
import { agentStepExecutionEndpoint } from './endpoint';
import type { AgentStepExecution } from './operation';

const SPEC = 'spec-1';
const alice = { kind: 'user' as const, id: 'alice' };
const viewer = { kind: 'user' as const, id: 'viewer' };
const policy = createAuthorization({
  resources: [SpecCapabilities],
  roles: {
    manage: [SpecCapabilities.capabilities.View, SpecCapabilities.capabilities.Manage],
    viewer: [SpecCapabilities.capabilities.View],
  },
  assignments: [
    { subject: alice, role: 'manage', scope: { specId: SPEC } },
    { subject: viewer, role: 'viewer', scope: { specId: SPEC } },
  ],
});
const launch = {
  archetype: 'implementer',
  provider: 'claude',
  model: 'claude-sonnet-5-5',
  session: { mode: 'fresh' as const },
};

function appWith(agentStepExecution: Partial<AgentStepExecution>, user = alice) {
  const app = Fastify({ ajv: RUNTIME_FASTIFY_OPTIONS.ajv });
  registerSharedContracts(app);
  registerRuntimeErrorHandler(app);
  app.decorateRequest('authz', {
    getter: () => createRequestAuthorization({ mode: 'subject', subject: user }, policy),
  });
  app.register(agentStepExecutionEndpoint, {
    agentStepExecution: agentStepExecution as AgentStepExecution,
  });

  return app;
}

const ask = (
  app: ReturnType<typeof appWith>,
  path = `/api/specs/${SPEC}/workflow/agent-execution`,
) =>
  app.inject({
    method: 'POST',
    url: path,
    payload: { requestId: randomUUID(), expected: { step: 'implement' } },
  });

describe('agent step execution routes', () => {
  it('explains an unavailable agent with its reason and paths (409, before anything starts)', async () => {
    const app = appWith({
      startAgentStepExecution: () =>
        Promise.reject(
          new AgentUnavailableError(
            {
              kind: 'unavailable',
              reason: 'dirty-baseline',
              paths: ['src/a.ts'],
              count: 4,
              launch,
            },
            'An agent cannot do this step now.',
          ),
        ),
    });

    const response = await ask(app);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'WORKFLOW_AGENT_UNAVAILABLE',
      details: { agent: { reason: 'dirty-baseline', paths: ['src/a.ts'], count: 4, launch } },
    });
    await app.close();
  });

  it("answers a Session refusal as the agent's provider not being ready", async () => {
    const app = appWith({
      startAgentStepExecution: () =>
        Promise.reject(
          new SessionError('PROVIDER_UNAVAILABLE', 'Session provider is not enabled.'),
        ),
    });

    const response = await ask(app, `/api/specs/${SPEC}/tasks/t1/workflow/agent-execution`);

    expect(response.json()).toMatchObject({
      code: 'WORKFLOW_AGENT_UNAVAILABLE',
      details: {
        agent: { reason: 'provider-not-ready', detail: 'Session provider is not enabled.' },
      },
    });
    await app.close();
  });

  it('needs Manage, and passes the subject and the expected position', async () => {
    const calls: unknown[] = [];
    const result = {
      kind: 'started' as const,
      subject: { kind: 'task' as const, specId: SPEC, taskId: 't1' },
      attemptId: 'a',
      step: 'implement',
      attempt: 1,
      sessionId: 's',
      turnId: 't',
      session: 'fresh' as const,
    };
    const startAgentStepExecution = (request: unknown) => {
      calls.push(request);

      return Promise.resolve(result);
    };

    const refused = appWith({ startAgentStepExecution }, viewer);
    expect((await ask(refused)).statusCode).toBe(403);
    await refused.close();

    const app = appWith({ startAgentStepExecution });
    const response = await ask(app, `/api/specs/${SPEC}/tasks/t1/workflow/agent-execution`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(calls).toMatchObject([
      {
        subject: result.subject,
        principal: JSON.stringify(alice),
        expected: { step: 'implement' },
      },
    ]);
    await app.close();
  });

  it('marks every available agent of the demo Runtime unavailable, keeping its launch', async () => {
    const projection: ActionProjection = {
      subject: { kind: 'specification', specId: SPEC },
      position: {
        kind: 'ready',
        next: {
          step: { id: 'implement', title: 'Implement', kind: 'work', executors: ['agent'] },
          human: false,
          agent: { kind: 'available', launch },
        },
      },
      actions: {},
    } as unknown as ActionProjection;

    expect((await demoAgentAvailability(projection.subject, projection)).position).toMatchObject({
      next: { agent: { kind: 'unavailable', reason: 'demo', launch } },
    });
  });
});
