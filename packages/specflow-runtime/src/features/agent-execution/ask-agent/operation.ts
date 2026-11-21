import { createHash } from 'node:crypto';

import type { AskAgentResult, StopAgentResult } from '@nevo/specflow-contracts/workflow';
import {
  AttributionRefusalError,
  WorkflowError,
  activeAgentAttempt,
  admitAgentTurn,
  agentAttemptScope,
  engineAgentContextSource,
  inspectActionsForRead,
  inspectWorkspaceExecution,
  listUnsettledWorkspaceExecutions,
  readAgentContextDigest,
  readStepContext,
  resolveSpecificationForRead,
  startAgentAttempt,
  type ActionProjection,
  type AgentActor,
  type AgentAttemptDependencies,
  type AgentAttemptView,
  type AgentLaunch,
  type AgentOption,
  type ExpectedPosition,
  type SpecFlowEngine,
  type WorkflowDependencies,
  type WorkflowSubject,
} from '@nevo/specflow-engine';

import { defaultAgentAllowlist } from '@nevo/specflow-contracts/runtime';

import type { SessionCoordinator } from '../../sessions';
import { AgentUnavailableError } from '../../workflow';
import { renderAgentBrief, untrusted } from '../brief/render';
import { chosenLaunch, withRuntimeReasons, type AgentRuntimeFacts } from './availability';

export interface AskAgentDependencies {
  readonly engine: SpecFlowEngine;
  /** The workflow operations, opened per call (definitions and project documents as they are now). */
  readonly openWorkflow: () => Promise<WorkflowDependencies>;
  readonly openAttempts: () => Promise<AgentAttemptDependencies>;
  /** The managed Session coordinator; absent while managed Sessions are disabled. */
  readonly coordinator: () => SessionCoordinator | undefined;
}

export interface AskAgentRequest {
  readonly subject: WorkflowSubject;
  /** The caller's principal, as the Session routes name it. */
  readonly principal: string;
  readonly requestId: string;
  readonly expected: ExpectedPosition;
  readonly provider?: string;
  readonly model?: string;
  readonly effort?: string;
  readonly message?: string;
}

const RUNTIME_ACTOR = 'runtime-ask-agent';

/** A UUID derived from the request, so a repeated request reuses its Session create and Turn. */
function derivedId(requestId: string, purpose: string): string {
  const hex = createHash('sha256').update(`${requestId}:${purpose}`).digest('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

/** The startable step a new attempt would work on, from the projection. */
function nextOf(projection: ActionProjection) {
  const position = projection.position;

  return position.kind === 'not-started' || position.kind === 'ready' || position.kind === 'blocked'
    ? position.next
    : undefined;
}

/**
 * Ask agent (D12, D18, D19): the Runtime side of one agent attempt. Every refusal comes before
 * anything exists when it can be known (the projection's reasons, the Engine's start checks); the
 * Engine starts the attempt with the trusted agent actor and binds the Turn; the Session is the
 * kernel's continuation (an independent step always a fresh one); the Turn is dispatched with the
 * brief, its claim bound to the attempt, so its writes go through the broker in the attempt's scope
 * and its settlement finalizes the attempt.
 */
export function createAskAgent(dependencies: AskAgentDependencies) {
  const { engine } = dependencies;
  const source = engineAgentContextSource(engine);

  /** An unsettled writer claim of the project, worded for the owner. */
  async function busyWriter(): Promise<AgentRuntimeFacts['busy']> {
    const page = await listUnsettledWorkspaceExecutions(engine, { limit: 20 });
    const held = page.items.find((record) => record.phase !== 'settled');
    if (!held) {
      return undefined;
    }

    return {
      detail:
        held.phase === 'unknown'
          ? `SpecFlow cannot tell whether the agent of Session ${held.intent.ownerId} is still running; nothing can be saved in this project until that is known.`
          : `The agent of Session ${held.intent.ownerId} is working in this project; wait until it stops.`,
    };
  }

  function providerFacts(provider: string): AgentRuntimeFacts['provider'] {
    const coordinator = dependencies.coordinator();
    if (!coordinator) {
      return undefined;
    }

    if (coordinator.available(provider)) {
      return { ready: true };
    }

    const described = coordinator.provider(provider);

    return {
      ready: false,
      detail: described
        ? (described.reason ?? `The provider ${provider} is not ready.`)
        : `The provider ${provider} is not enabled in this Runtime.`,
    };
  }

  /** The baseline refusal of a Turn at `expected`, as facts. */
  async function baselineFacts(
    attempts: AgentAttemptDependencies,
    subject: WorkflowSubject,
    workspaceId: string,
    expected: ExpectedPosition,
  ): Promise<AgentRuntimeFacts['baseline']> {
    try {
      await admitAgentTurn(attempts, { subject, workspaceId, expected });

      return undefined;
    } catch (error) {
      if (
        error instanceof AttributionRefusalError &&
        (error.code === 'WORKFLOW_DIRTY_BASELINE' || error.code === 'WORKFLOW_BASELINE_CHANGED')
      ) {
        return {
          reason: error.code === 'WORKFLOW_DIRTY_BASELINE' ? 'dirty-baseline' : 'baseline-changed',
          paths: [...error.attribution.paths],
          count: error.attribution.count,
        };
      }

      throw error;
    }
  }

  async function workspaceIdOf(specId: string): Promise<string | undefined> {
    const found = await resolveSpecificationForRead(engine, specId);

    return found.status === 'available' ? found.workspaceId : undefined;
  }

  /** The option with every Runtime reason (cheapest first: the baseline reads the checkout). */
  async function judged(
    option: AgentOption,
    subject: WorkflowSubject,
    expected: ExpectedPosition,
    attempts: () => Promise<AgentAttemptDependencies>,
  ): Promise<AgentOption> {
    if (option.kind === 'unavailable') {
      return option;
    }

    const facts: AgentRuntimeFacts = {
      sessions: dependencies.coordinator() !== undefined,
      provider: providerFacts(option.launch.provider),
      busy: await busyWriter(),
    };
    const first = withRuntimeReasons(option, facts);
    if (first.kind === 'unavailable') {
      return first;
    }

    const workspaceId = await workspaceIdOf(subject.specId);
    if (workspaceId === undefined) {
      return option;
    }

    return withRuntimeReasons(option, {
      ...facts,
      baseline: await baselineFacts(await attempts(), subject, workspaceId, expected),
    });
  }

  /** The agent attempt of the active step, with its Turn's state and whether Continue can start. */
  async function attemptView(
    workflow: WorkflowDependencies,
    subject: WorkflowSubject,
    attempts: () => Promise<AgentAttemptDependencies>,
  ): Promise<AgentAttemptView | undefined> {
    const active = await activeAgentAttempt(workflow, subject);
    if (!active) {
      return undefined;
    }

    const journal = await (await attempts()).journal.read(active.attemptId);
    const turn = journal?.turns.at(-1);
    if (!journal || !turn) {
      return undefined;
    }

    const actor = journal.actor;
    const sessionId = actor.details.sessionId ?? '';
    const state = await turnState(sessionId, turn);
    const launch: AgentLaunch = {
      archetype: actor.details.archetype ?? '',
      provider: actor.details.provider,
      model: actor.details.model ?? '',
      session: { mode: 'reuse', sessionId },
    };
    const proceed: AgentOption =
      state === 'ended'
        ? await judged(
            { kind: 'available', launch },
            subject,
            { step: active.step, attempt: active.attempt },
            attempts,
          )
        : {
            kind: 'unavailable',
            reason: 'project-busy',
            detail:
              state === 'unknown'
                ? "SpecFlow cannot tell whether the agent's process is still running."
                : 'The agent is still working on this attempt.',
            launch,
          };
    const proposal = journal.proposal;

    return {
      attemptId: active.attemptId,
      step: active.step,
      attempt: active.attempt,
      sessionId,
      provider: actor.details.provider,
      ...(actor.details.model !== undefined ? { model: actor.details.model } : {}),
      turn: {
        turnId: turn.turnId,
        state,
        boundAt: turn.boundAt,
        ...(turn.finalizedAt !== undefined ? { endedAt: turn.finalizedAt } : {}),
      },
      turns: journal.turns.length,
      ...(proposal
        ? {
            proposal: {
              transition: proposal.transition,
              state: proposal.state,
              submittedAt: proposal.submittedAt,
              ...(proposal.refusal
                ? {
                    refusal: {
                      code: proposal.refusal.code,
                      message: proposal.refusal.message,
                      ...(proposal.refusal.attribution
                        ? { paths: [...proposal.refusal.attribution.paths] }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
      continue: proceed,
    };
  }

  /**
   * Where the attempt's current Turn is: from its Session (running, being cancelled, outcome
   * unknown) and its execution claim, else ended.
   */
  async function turnState(
    sessionId: string,
    turn: { readonly turnId: string; readonly invocationId: string; readonly finalizedAt?: string },
  ): Promise<AgentAttemptView['turn']['state']> {
    if (turn.finalizedAt !== undefined) {
      return 'ended';
    }

    const claim = await inspectWorkspaceExecution(engine, turn.invocationId);
    if (claim?.phase === 'unknown') {
      return 'unknown';
    }

    const coordinator = dependencies.coordinator();
    const activeTurn = coordinator
      ? (await coordinator.snapshot(sessionId, RUNTIME_ACTOR).catch(() => undefined))?.activeTurn
      : undefined;
    if (activeTurn?.turnId === turn.turnId) {
      return activeTurn.state === 'cancelling'
        ? 'stopping'
        : activeTurn.state === 'unknown'
          ? 'unknown'
          : 'working';
    }

    return claim !== undefined && claim.phase !== 'settled' ? 'working' : 'ended';
  }

  /** The projection with the Runtime's agent reasons and the active agent attempt. */
  async function decorate(
    subject: WorkflowSubject,
    projection: ActionProjection,
  ): Promise<ActionProjection> {
    let opened: Promise<AgentAttemptDependencies> | undefined;
    const attempts = () => (opened ??= dependencies.openAttempts());
    const position = projection.position;
    if ((position.kind === 'not-started' || position.kind === 'ready') && position.next) {
      const next = position.next;
      const agent = await judged(next.agent, subject, { step: next.step.id }, attempts);

      return { ...projection, position: { ...position, next: { ...next, agent } } };
    }

    if (position.kind === 'active' && position.attempt.actor.class === 'agent') {
      const view = await attemptView(await dependencies.openWorkflow(), subject, attempts);

      return view ? { ...projection, agentAttempt: view } : projection;
    }

    return projection;
  }

  async function askAgent(request: AskAgentRequest): Promise<AskAgentResult> {
    const coordinator = dependencies.coordinator();
    const { subject, expected } = request;
    const workflow = await dependencies.openWorkflow();
    const continuing = expected.attempt !== undefined;
    const raw = await inspectActionsForRead(workflow, subject);
    // A new attempt is judged with the agent the owner chose, below; Continue with its own Session.
    const projection = continuing ? await decorate(subject, raw) : raw;
    let launch: AgentLaunch;
    let actor: AgentActor;
    let sessionId: string;
    let fresh = false;
    if (continuing) {
      const view = projection.agentAttempt;
      if (view?.step !== expected.step || view.attempt !== expected.attempt) {
        throw new WorkflowError(
          'WORKFLOW_ATTEMPT_MISMATCH',
          `The step ${expected.step} has no agent attempt ${String(expected.attempt)} to continue.`,
        );
      }

      if (view.continue.kind === 'unavailable') {
        throw new AgentUnavailableError(
          view.continue,
          'The agent cannot continue this attempt now.',
        );
      }

      if (request.provider ?? request.model ?? request.effort) {
        invalid('A continued Session keeps its agent and model.');
      }

      const journal = await (await dependencies.openAttempts()).journal.read(view.attemptId);
      if (!journal) {
        throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The agent attempt has no journal.');
      }

      launch = view.continue.launch;
      actor = journal.actor;
      sessionId = view.sessionId;
    } else {
      const next = nextOf(projection);
      if (next?.step.id !== expected.step) {
        throw new WorkflowError(
          'WORKFLOW_ATTEMPT_MISMATCH',
          `The run is not ready to start ${expected.step}.`,
        );
      }

      if (next.agent.kind === 'unavailable') {
        throw new AgentUnavailableError(next.agent, 'An agent cannot do this step now.');
      }

      const chosen = chosenLaunch(next.agent.launch, request);
      if (chosen === 'not-for-a-continued-session') {
        invalid(
          'This step continues the Session that did the step before; its agent and model stay as they are.',
        );
      }

      if (!chosen.model) {
        invalid(`Choose a model for ${chosen.provider}.`);
      }

      const option = await judged(
        { ...next.agent, launch: chosen },
        subject,
        { step: next.step.id },
        () => dependencies.openAttempts(),
      );
      if (option.kind === 'unavailable') {
        throw new AgentUnavailableError(option, 'An agent cannot do this step now.');
      }

      launch = chosen;
      if (!coordinator) {
        throw new AgentUnavailableError(
          { kind: 'unavailable', reason: 'provider-not-ready', launch },
          'Managed agent Sessions are not enabled in this Runtime.',
        );
      }

      if (launch.session.mode === 'reuse') {
        sessionId = launch.session.sessionId;
      } else {
        fresh = true;
        ({ sessionId } = await coordinator.create(
          request.principal,
          {
            requestId: derivedId(request.requestId, 'session'),
            providerId: launch.provider,
            modelId: launch.model,
            ...(launch.effort !== undefined ? { effort: launch.effort } : {}),
            mode: 'workspace-write',
            title: `Ask agent: ${next.step.title}`.slice(0, 256),
          },
          {
            specId: subject.specId,
            taskIds: subject.kind === 'task' ? [subject.taskId] : [],
            origin: 'workflow',
          },
        ));
      }

      actor = {
        class: 'agent',
        details: {
          archetype: launch.archetype,
          provider: launch.provider,
          model: launch.model,
          sessionId,
        },
      };
    }

    if (!coordinator) {
      throw new AgentUnavailableError(
        { kind: 'unavailable', reason: 'provider-not-ready', launch },
        'Managed agent Sessions are not enabled in this Runtime.',
      );
    }

    const workspaceId = await workspaceIdOf(subject.specId);
    if (workspaceId === undefined) {
      throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'The Specification is not available.');
    }

    const attempts = await dependencies.openAttempts();
    const invocationId = derivedId(request.requestId, 'invocation');
    const turnId = derivedId(request.requestId, 'turn');
    const contextDigest = continuing
      ? undefined
      : await readAgentContextDigest(workflow, source, subject);
    const started = await startAgentAttempt(attempts, {
      subject,
      ...(subject.kind === 'specification'
        ? { archetype: await workflow.references.archetype(subject.specId) }
        : {}),
      actor,
      expected,
      workspaceId,
      turn: { invocationId, turnId },
      ...(contextDigest !== undefined ? { contextDigest } : {}),
    });
    const { attemptId } = started.binding;
    // A Session that continues into a Task's step belongs to that Task too.
    if (!fresh && subject.kind === 'task') {
      await coordinator.associateTasks(sessionId, subject.specId, [subject.taskId]);
    }

    const scope = (await agentAttemptScope(attempts, attemptId))?.scope;
    if (!scope) {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The agent attempt has no journal.');
    }

    const context = await readStepContext(workflow, source, subject);
    const brief = [
      renderAgentBrief({ context, scope }),
      ...(request.message !== undefined
        ? ['', '## Note from the owner', untrusted('owner', request.message)]
        : []),
    ].join('\n');
    await coordinator.start(
      request.principal,
      sessionId,
      {
        requestId: derivedId(request.requestId, 'turn-request'),
        message: brief,
        mode: 'workspace-write',
      },
      {
        ids: { turnId, invocationId },
        agentAttempt: { attemptId },
        // The archetype's allowlist for this provider, else the default (D20): only for this Turn.
        // An absent or empty `allow` means no list of its own.
        agentPermissions: {
          allow: (() => {
            const own = workflow.catalogue
              .archetype(actor.details.archetype ?? '')
              ?.providers.find((entry) => entry.provider === actor.details.provider)
              ?.permissions?.allow;

            return own !== undefined && own.length > 0
              ? own
              : defaultAgentAllowlist(actor.details.provider);
          })(),
        },
      },
    );

    return {
      kind: continuing ? 'continued' : 'started',
      subject,
      attemptId,
      step: context.step.id,
      attempt: context.attempt,
      sessionId,
      turnId,
      session: fresh ? 'fresh' : 'reuse',
    };
  }

  /**
   * Stop (D19): cancels the agent attempt's running Turn. The claim stays held until the agent's
   * process is proven stopped; then the Turn's settlement finalizes the attempt as a Turn that ended.
   */
  async function stopAgent(request: {
    readonly subject: WorkflowSubject;
    readonly principal: string;
    readonly requestId: string;
    readonly attemptId: string;
  }): Promise<StopAgentResult> {
    const coordinator = dependencies.coordinator();
    const active = await activeAgentAttempt(await dependencies.openWorkflow(), request.subject);
    if (active?.attemptId !== request.attemptId) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'This agent attempt is not the active attempt any more.',
      );
    }

    const journal = await (await dependencies.openAttempts()).journal.read(active.attemptId);
    const turn = journal?.turns.at(-1);
    const sessionId = journal?.actor.details.sessionId;
    if (!turn || !sessionId || !coordinator) {
      throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'The agent is not working now.');
    }

    await coordinator.cancel(request.principal, sessionId, turn.turnId, request.requestId);

    return { attemptId: active.attemptId, sessionId, turnId: turn.turnId };
  }

  return { decorate, askAgent, stopAgent };
}

export type AskAgent = ReturnType<typeof createAskAgent>;
