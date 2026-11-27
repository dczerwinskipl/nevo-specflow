import { AGENT_BROKER_ENVIRONMENT } from '@nevo/specflow-contracts/runtime';
import {
  admitAgentTurn,
  agentAttemptScope,
  assertAgentTurnAdmissible,
  settleAbandonedAgentTurn,
  deriveAgentScope,
  finalizeAgentAttempt,
  openAgentAttempts,
  openWorkflow,
  readAgentSessionOrigins,
  recoverAgentAttempts,
  type AgentWriteActor,
  type AgentWriteScope,
  type OpenWorkflowOptions,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import {
  SessionError,
  type AgentAttemptSettlement,
  type AgentTurnAdmission,
  type InvocationCapabilities,
  type InvocationCapabilityBinding,
  type SessionCoordinator,
} from '../sessions';
import type { FirstStepStarter, ProjectIdSource } from '../specs';
import { workflowFailure } from '../workflow';
import { agentStepExecutionEndpoint } from './step-execution/endpoint';
import { createAgentStepExecution, derivedId } from './step-execution/operation';
import { firstStepRefusal } from './step-execution/refusal';
import {
  createBrokerDispatcher,
  type BrokerDocuments,
  type BrokerWorkflow,
} from './broker/dispatch';
import { createEngineBrokerDocuments } from './broker/documents';
import type { BrokerEndpoint } from './broker/endpoint';
import { createBrokerServer } from './broker/server';
import { createAgentStepEngine } from './step-execution/engine-port';
import { createEngineBrokerWorkflow } from './broker/workflow';
import { createCapabilityRegistry } from './capability/registry';
import { redactCapabilities } from './capability/redaction';

/** The agent step execution routes of a Runtime without agent execution (no Engine, the demo): 503. */
export function createUnavailableAgentStepExecutionFeature(): RuntimeFeature {
  return {
    authorizationResources: [],
    register(app) {
      app.register(agentStepExecutionEndpoint, {});
    },
  };
}

export interface AgentExecutionFeatureOptions {
  engine: SpecFlowEngine;
  /** The project documents of `project-document` context references (per request). */
  projectDocument?: () => OpenWorkflowOptions['projectDocument'];
  /** The managed Session coordinator, read at request time (absent while Sessions are off). */
  coordinator?: () => SessionCoordinator | undefined;
  projectId?: ProjectIdSource;
  /** Test seams. */
  documents?: BrokerDocuments;
  workflow?: BrokerWorkflow;
  openEndpoint?: () => Promise<BrokerEndpoint>;
  random?: (size: number) => Buffer;
}

/**
 * Agent execution (D11, D12): the invocation capability of each write Turn and the local broker
 * through which that Turn's product CLI writes, as the Turn's own claim; agent step execution (start, Continue,
 * Stop) and the finalize of an agent attempt's Turn when its claim settles. Sessions receives
 * `capabilities` and `settleAgentAttempt`; the workflow routes receive `agentAvailability`.
 */
export function createAgentExecutionFeature(
  options: AgentExecutionFeatureOptions,
): RuntimeFeature & {
  readonly capabilities: InvocationCapabilities;
  readonly settleAgentAttempt: AgentAttemptSettlement;
  readonly agentTurns: AgentTurnAdmission;
  readonly agentAvailability: ReturnType<typeof createAgentStepExecution>['decorate'];
  /** Agent step execution, Continue and Stop (the owner routes call it). */
  readonly agentStepExecution: ReturnType<typeof createAgentStepExecution>;
  /** The agent start of Create's first-step intents (the Specifications feature calls it). */
  readonly firstStepStarter: FirstStepStarter;
  close(): Promise<void>;
} {
  const { engine } = options;
  const projectDocument = () => options.projectDocument?.();
  const workflowOptions = (): OpenWorkflowOptions => {
    const lookup = projectDocument();

    return lookup ? { projectDocument: lookup } : {};
  };

  const openAttempts = () => openAgentAttempts(engine, workflowOptions());
  const registry = createCapabilityRegistry(options.random ? { random: options.random } : {});
  const dispatcher = createBrokerDispatcher({
    registry,
    documents: options.documents ?? createEngineBrokerDocuments(engine),
    workflow:
      options.workflow ??
      createEngineBrokerWorkflow({
        workflow: (owned) => openWorkflow(engine, { ...workflowOptions(), ownedExecution: owned }),
        attempts: openAttempts,
      }),
    refusalOf: (error) => workflowFailure(error)?.body,
  });
  const server = createBrokerServer({
    dispatcher,
    ...(options.openEndpoint ? { openEndpoint: options.openEndpoint } : {}),
  });
  const agentStepExecution = createAgentStepExecution({
    engine: createAgentStepEngine({
      engine,
      openWorkflow: () => openWorkflow(engine, workflowOptions()),
      openAttempts,
    }),
    sessions: () => options.coordinator?.(),
  });

  // Create's "then run the first step with this agent": a start of the new Specification's first
  // step, as the principal who asked, under a request id derived from the Create operation (a
  // repeated start, after a retry or a restart, finds the attempt the first one made).
  const firstStepStarter: FirstStepStarter = {
    async start(input) {
      const result = await agentStepExecution.startAgentStepExecution({
        subject: { kind: 'specification', specId: input.specId },
        principal: input.principal,
        requestId: derivedId(input.operationId, 'create-first-step'),
        expected: { step: input.step },
        provider: input.provider,
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.effort !== undefined ? { effort: input.effort } : {}),
      });

      return { sessionId: result.sessionId, attemptId: result.attemptId };
    },
    refusal: firstStepRefusal,
  };

  /**
   * The scope and actor of a Turn: an agent attempt's, from what the Engine recorded for it (the
   * Turn must be its current Turn, and its baseline is admitted again now, under the claim, before
   * the provider process exists); otherwise the ad-hoc scope of the Session's home Specification.
   */
  async function scopeOf(
    binding: InvocationCapabilityBinding,
  ): Promise<{ scope: AgentWriteScope; actor: AgentWriteActor }> {
    if (binding.attemptId === undefined) {
      return {
        scope: deriveAgentScope({ kind: 'ad-hoc', specId: binding.specId }),
        actor: {
          class: 'agent',
          details: {
            provider: binding.provider,
            ...(binding.model !== undefined ? { model: binding.model } : {}),
            sessionId: binding.sessionId,
          },
        },
      };
    }

    const attempts = await openAttempts();
    const found = await agentAttemptScope(attempts, binding.attemptId);
    const journal = found?.journal;
    if (
      !found ||
      !journal ||
      journal.turns.at(-1)?.invocationId !== binding.invocationId ||
      journal.subject.specId !== binding.specId ||
      journal.actor.details.sessionId !== binding.sessionId
    ) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'The Turn is not the current Turn of its agent attempt.',
      );
    }

    await admitAgentTurn(attempts, {
      subject: journal.subject,
      workspaceId: journal.workspaceId,
      expected: { step: journal.step, attempt: journal.attempt },
    });

    return { scope: found.scope, actor: journal.actor };
  }

  const capabilities: InvocationCapabilities = {
    async mint(binding) {
      const { scope, actor } = await scopeOf(binding);
      const endpoint = await server.endpoint();
      const handle = registry.mint({
        invocationId: binding.invocationId,
        sessionId: binding.sessionId,
        turnId: binding.turnId,
        specId: binding.specId,
        ...(scope.taskId !== undefined ? { taskId: scope.taskId } : {}),
        workspace: binding.workspace,
        scope,
        actor,
      });

      return {
        environment: {
          [AGENT_BROKER_ENVIRONMENT.endpoint]: endpoint,
          [AGENT_BROKER_ENVIRONMENT.capability]: handle.value,
        },
        secrets: [handle.value],
        activate: () => handle.activate(),
        revoke: () => handle.revoke(),
        redact: (text) => redactCapabilities(text, [handle.value]),
      };
    },
  };

  /**
   * The settlement of an agent attempt's Turn (D12), on the native-stop receipt: the Turn's
   * finalize publishes the step state (the proposal, or nothing for a Turn without one) and settles
   * the claim in one section, then runs the post actions. The same call is the recovery of a
   * finalize a crash interrupted (reconcile and startup recovery settle through here too).
   */
  const settleAgentAttempt: AgentAttemptSettlement = async (intent, receipt) => {
    await finalizeAgentAttempt(await openAttempts(), {
      attemptId: intent.attempt.attemptId,
      intent,
      receipt,
    });
  };

  const agentTurns: AgentTurnAdmission = {
    async admissible(attemptId, invocationId) {
      const attempts = await openAttempts();

      return () => assertAgentTurnAdmissible(attempts, attemptId, invocationId);
    },
    abandoned: async (attemptId) => settleAbandonedAgentTurn(await openAttempts(), attemptId),
    async ownerTurnHold(specId, sessionId) {
      const origin = (
        await readAgentSessionOrigins(await openWorkflow(engine, workflowOptions()), specId)
      ).get(sessionId);

      return origin ? agentStepExecution.ownerTurnHold(origin.subject, sessionId) : undefined;
    },
  };

  return {
    authorizationResources: [],
    capabilities,
    settleAgentAttempt,
    agentTurns,
    agentAvailability: (subject, projection) => agentStepExecution.decorate(subject, projection),
    agentStepExecution,
    firstStepStarter,
    close: () => server.close(),
    async register(app) {
      app.addHook('onClose', () => server.close());
      app.register(agentStepExecutionEndpoint, {
        agentStepExecution,
        ...(options.projectId ? { projectId: options.projectId } : {}),
      });
      // The post actions of attempts a crash left pending after their finalize (the Session
      // recovery, registered before, finalized the Turns whose process is proven stopped).
      try {
        const recovery = await recoverAgentAttempts(await openAttempts());
        for (const failed of recovery.failed) {
          app.log.warn(
            { attemptId: failed.attemptId, code: failed.code },
            'Agent attempt recovery failed',
          );
        }
      } catch (error) {
        app.log.warn({ err: error }, 'Agent attempt recovery could not run');
      }
    },
  };
}
