import { createHash } from 'node:crypto';

import type {
  AgentStepExecutionCheck,
  AgentStepExecutionResult,
  StopAgentStepExecutionResult,
} from '@nevo/specflow-contracts/workflow';
import {
  WorkflowError,
  type ActionProjection,
  type OwnerReturnResult,
  type ReturnToStepInput,
  type TakeOverAgentAttemptInput,
  type TakeOverAgentAttemptResult,
  type AgentActor,
  type AgentAttemptView,
  type AgentLaunch,
  type AgentOption,
  type ExpectedPosition,
  type WorkflowSubject,
} from '@nevo/specflow-engine';

import { defaultAgentAllowlist } from '@nevo/specflow-contracts/runtime';

import { SessionError, type SessionCoordinator } from '../../sessions';
import { AgentUnavailableError } from '../../workflow';
import { untrusted } from '../brief/render';
import { chosenLaunch, withRuntimeReasons, type AgentRuntimeFacts } from './availability';
import type { ActiveAgentAttempt, AgentBrief, AgentStepEngine } from './engine-port';

/** The Session operations agent step execution uses. */
export type AgentStepSessions = Pick<
  SessionCoordinator,
  | 'available'
  | 'provider'
  | 'create'
  | 'start'
  | 'cancel'
  | 'snapshot'
  | 'associateTasks'
  | 'hasSession'
  | 'hasTurn'
>;

export interface AgentStepExecutionDependencies {
  readonly engine: AgentStepEngine;
  /** The managed Sessions; absent while managed Sessions are disabled. */
  readonly sessions: () => AgentStepSessions | undefined;
}

export interface AgentStepExecutionRequest {
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

const RUNTIME_ACTOR = 'runtime-agent-execution';

/**
 * A UUID derived from the request: a repeated request names the same Session, Turn and invocation,
 * so its retry finds what the first one made instead of making it again.
 */
export function derivedId(requestId: string, purpose: string): string {
  const hex = createHash('sha256').update(`${requestId}:${purpose}`).digest('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

function unavailable(
  option: Extract<AgentOption, { kind: 'unavailable' }>,
  message: string,
): never {
  throw new AgentUnavailableError(option, message);
}

/** The startable step a new attempt would work on, from the projection. */
function nextOf(projection: ActionProjection) {
  const position = projection.position;

  return position.kind === 'not-started' || position.kind === 'ready'
    ? position.next
    : position.kind === 'blocked'
      ? position.next
      : undefined;
}

/** How a Continue launches: the attempt's own agent in its own Session. */
function continueLaunch(active: ActiveAgentAttempt): AgentLaunch {
  const { details } = active.journal.actor;

  return {
    archetype: details.archetype ?? '',
    provider: details.provider,
    model: details.model ?? '',
    ...(active.launch?.effort !== undefined ? { effort: active.launch.effort } : {}),
    session: { mode: 'reuse', sessionId: details.sessionId ?? '' },
  };
}

function isSameSubject(
  held: { readonly specId: string; readonly taskId?: string },
  subject: WorkflowSubject,
): boolean {
  return (
    held.specId === subject.specId &&
    held.taskId === (subject.kind === 'task' ? subject.taskId : undefined)
  );
}

/**
 * Agent step execution (D12, D18, D19): the Runtime side of one agent attempt. Every refusal that
 * can be known comes before anything exists (the Runtime's reasons, the Engine's start checks); the
 * Engine starts the attempt with the trusted agent actor and binds the Turn; only then is a fresh
 * Session created (with the id the actor already names), so a refused start leaves no Session; the
 * Turn is dispatched with the brief, its claim bound to the attempt. A repeated request finds the
 * Turn the Engine bound for it and completes what is missing, never a second attempt or Session.
 */
export function createAgentStepExecution(dependencies: AgentStepExecutionDependencies) {
  const { engine } = dependencies;

  function providerFacts(provider: string): AgentRuntimeFacts['provider'] {
    const sessions = dependencies.sessions();
    if (!sessions) {
      return undefined;
    }

    if (sessions.available(provider)) {
      return { ready: true };
    }

    const described = sessions.provider(provider);

    return {
      ready: false,
      detail: described
        ? (described.reason ?? `The provider ${provider} is not ready.`)
        : `The provider ${provider} is not enabled in this Runtime.`,
    };
  }

  /**
   * The option with the Runtime's reasons. `checkout` reads the checkout's baseline (Git): the
   * explicit check and the start; the projection never does and says `baseline: unchecked`.
   */
  async function judged(
    option: AgentOption,
    subject: WorkflowSubject,
    expected: ExpectedPosition,
    checkout: boolean,
  ): Promise<AgentOption> {
    if (option.kind === 'unavailable') {
      return option;
    }

    const facts: AgentRuntimeFacts = {
      sessions: dependencies.sessions() !== undefined,
      provider: providerFacts(option.launch.provider),
      busy: await engine.busyWriter(),
    };
    const first = withRuntimeReasons(option, facts);
    if (first.kind === 'unavailable') {
      return first;
    }

    if (!checkout) {
      return { ...option, baseline: 'unchecked' };
    }

    const { baseline: _unchecked, ...checked } = option;
    const workspaceId = await engine.workspaceIdOf(subject.specId);

    return workspaceId === undefined
      ? checked
      : withRuntimeReasons(checked, {
          ...facts,
          baseline: await engine.baseline(subject, workspaceId, expected),
        });
  }

  /** Where the attempt's current Turn is: its Session, then its execution claim. */
  async function turnState(active: ActiveAgentAttempt): Promise<AgentAttemptView['turn']['state']> {
    const turn = active.journal.turns.at(-1)!;
    const sessionId = active.journal.actor.details.sessionId ?? '';
    const sessions = dependencies.sessions();
    // A Session that does not exist is its own state, never read as an ended Turn.
    if (sessions && !(await sessions.hasSession(sessionId))) {
      return 'session-missing';
    }

    if (turn.finalizedAt !== undefined) {
      return 'ended';
    }

    const phase = await engine.claimPhase(turn.invocationId);
    if (phase === 'unknown') {
      return 'unknown';
    }

    const activeTurn = sessions
      ? (await sessions.snapshot(sessionId, RUNTIME_ACTOR)).activeTurn
      : undefined;
    if (activeTurn?.turnId === turn.turnId) {
      return activeTurn.state === 'cancelling'
        ? 'stopping'
        : activeTurn.state === 'unknown'
          ? 'unknown'
          : 'working';
    }

    return phase !== undefined && phase !== 'settled' ? 'working' : 'ended';
  }

  /** Whether Continue can start now: only once the Turn ended. */
  async function continueOption(
    active: ActiveAgentAttempt,
    subject: WorkflowSubject,
    state: AgentAttemptView['turn']['state'],
    checkout: boolean,
  ): Promise<AgentOption> {
    const launch = continueLaunch(active);
    if (state === 'session-missing' && active.launch?.session !== 'fresh') {
      return {
        kind: 'unavailable',
        reason: 'session-unavailable',
        detail: 'The Session this attempt continues no longer exists.',
        launch,
      };
    }

    if (state !== 'ended' && state !== 'session-missing') {
      return {
        kind: 'unavailable',
        reason: 'project-busy',
        detail:
          state === 'unknown'
            ? "SpecFlow cannot tell whether the agent's process is still running."
            : 'The agent is still working on this attempt.',
        launch,
      };
    }

    return judged(
      { kind: 'available', launch },
      subject,
      { step: active.step, attempt: active.attempt },
      checkout,
    );
  }

  async function attemptView(
    active: ActiveAgentAttempt,
    subject: WorkflowSubject,
  ): Promise<AgentAttemptView> {
    const { journal } = active;
    const turn = journal.turns.at(-1)!;
    const actor = journal.actor;
    const state = await turnState(active);
    const proposal = journal.proposal;

    return {
      attemptId: active.attemptId,
      step: active.step,
      attempt: active.attempt,
      sessionId: actor.details.sessionId ?? '',
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
      continue: await continueOption(active, subject, state, false),
      ...(journal.returnRequest && journal.returnRequest.state !== 'applied'
        ? {
            returnRequest: {
              to: journal.returnRequest.step,
              requestedAt: journal.returnRequest.requestedAt,
              state: journal.returnRequest.state,
              ...(journal.returnRequest.refusal
                ? {
                    refusal: {
                      code: journal.returnRequest.refusal.code,
                      message: journal.returnRequest.refusal.message,
                    },
                  }
                : {}),
              ...(journal.returnRequest.state === 'requested'
                ? state === 'ended' || state === 'session-missing'
                  ? // The Turn never ran or has ended without its finalize applying it (an
                    // abandoned start): it applies at the owner's next action (Return, Take over).
                    { appliesOn: 'next-action' as const }
                  : { stop: state === 'stopping' ? ('sent' as const) : ('failed' as const) }
                : {}),
            },
          }
        : {}),
      takeOver: await takeOverOption(active, state),
      work: await engine.work(subject, active),
    };
  }

  /**
   * Whether Take over can run now: only once the agent's process is proven ended (its last Turn's
   * claim settled, or never admitted) and no return of the attempt waits to apply. A bound Turn
   * whose Session is still starting it (no claim yet) is `agent-working` too: Take over waits until
   * it runs and is stopped, or its start fails (a Take over that lands first refuses that Turn's
   * admission, so it never runs).
   */
  async function takeOverOption(
    active: ActiveAgentAttempt,
    state: AgentAttemptView['turn']['state'],
  ): Promise<AgentAttemptView['takeOver']> {
    if (active.journal.returnRequest?.state === 'requested') {
      return { kind: 'unavailable', reason: 'return-requested' };
    }

    if (state === 'unknown') {
      return { kind: 'unavailable', reason: 'outcome-unknown' };
    }

    if (state === 'working' || state === 'stopping') {
      return { kind: 'unavailable', reason: 'agent-working' };
    }

    const phase = await engine.claimPhase(active.journal.turns.at(-1)!.invocationId);
    if (phase === 'unknown') {
      return { kind: 'unavailable', reason: 'outcome-unknown' };
    }

    return phase === undefined || phase === 'settled'
      ? { kind: 'available' }
      : { kind: 'unavailable', reason: 'agent-working' };
  }

  /**
   * The projection with the Runtime's agent reasons and the active agent attempt. Read path: no Git
   * (the baseline is `unchecked`; `check` reads it).
   */
  async function decorate(
    subject: WorkflowSubject,
    projection: ActionProjection,
  ): Promise<ActionProjection> {
    const [own, hold] = await Promise.all([decorateOwn(subject, projection), engine.projectHold()]);

    // The subject's own agent is its `agentAttempt`; the hold names only another subject's.
    return hold && !isSameSubject(hold.subject, subject) ? { ...own, projectHold: hold } : own;
  }

  /** The projection with the Runtime's agent reasons and the subject's own agent attempt. */
  async function decorateOwn(
    subject: WorkflowSubject,
    projection: ActionProjection,
  ): Promise<ActionProjection> {
    const position = projection.position;
    if ((position.kind === 'not-started' || position.kind === 'ready') && position.next) {
      const next = position.next;
      const agent = await judged(next.agent, subject, { step: next.step.id }, false);

      return { ...projection, position: { ...position, next: { ...next, agent } } };
    }

    if (position.kind === 'active' && position.attempt.actor.class === 'agent') {
      const active = await engine.activeAttempt(subject);

      return active
        ? { ...projection, agentAttempt: await attemptView(active, subject) }
        : projection;
    }

    return projection;
  }

  /**
   * The explicit check the Run with agent dialog runs when it opens (explain before action): the full
   * availability of what a start would work on now, the checkout's baseline included.
   */
  async function check(subject: WorkflowSubject): Promise<{
    readonly position: AgentStepExecutionCheck['position'];
    readonly agent: AgentOption;
  }> {
    const projection = await engine.actions(subject);
    const position = projection.position;
    if (position.kind === 'active') {
      const active = await engine.activeAttempt(subject);
      if (!active) {
        throw new WorkflowError(
          'WORKFLOW_POSITION_INVALID',
          'A person works on the active step; an agent cannot continue it.',
        );
      }

      return {
        position: { step: active.step, attempt: active.attempt },
        agent: await continueOption(active, subject, await turnState(active), true),
      };
    }

    const next = nextOf(projection);
    if (!next) {
      throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No step can be started now.');
    }

    return {
      position: { step: next.step.id },
      agent: await judged(next.agent, subject, { step: next.step.id }, true),
    };
  }

  async function allowlistOf(actor: AgentActor): Promise<readonly string[]> {
    const own = await engine.archetypeAllowlist(
      actor.details.archetype ?? '',
      actor.details.provider,
    );

    return own !== undefined && own.length > 0
      ? own
      : defaultAgentAllowlist(actor.details.provider);
  }

  /**
   * The fresh Session of an attempt, created by whichever request comes first (the start, its retry,
   * or a Continue after a create that failed): keyed on the attempt and created with the id its
   * agent actor names, so it exists at most once and never under another id.
   */
  async function ensureFreshSession(
    sessions: AgentStepSessions,
    request: Pick<AgentStepExecutionRequest, 'principal' | 'subject'>,
    attempt: { readonly attemptId: string; readonly actor: AgentActor; readonly effort?: string },
  ): Promise<void> {
    const sessionId = attempt.actor.details.sessionId!;
    if (await sessions.hasSession(sessionId)) {
      return;
    }

    const { subject } = request;
    await sessions.create(
      request.principal,
      {
        requestId: derivedId(attempt.attemptId, 'session-request'),
        providerId: attempt.actor.details.provider,
        ...(attempt.actor.details.model !== undefined
          ? { modelId: attempt.actor.details.model }
          : {}),
        ...(attempt.effort !== undefined ? { effort: attempt.effort } : {}),
        mode: 'workspace-write',
        title: 'Agent step execution',
      },
      {
        specId: subject.specId,
        taskIds: subject.kind === 'task' ? [subject.taskId] : [],
        origin: 'workflow',
      },
      { sessionId },
    );
  }

  /** Creates the fresh Session, joins a Task, and dispatches the Turn unless it exists already. */
  async function dispatch(
    sessions: AgentStepSessions,
    request: AgentStepExecutionRequest,
    bound: {
      readonly attemptId: string;
      readonly actor: AgentActor;
      readonly fresh: boolean;
      readonly effort?: string;
      readonly kind: AgentStepExecutionResult['kind'];
      /** The brief the start rendered from the context it recorded; absent for a retry. */
      readonly brief?: AgentBrief;
    },
  ): Promise<AgentStepExecutionResult> {
    const { subject } = request;
    const sessionId = bound.actor.details.sessionId!;
    const turnId = derivedId(request.requestId, 'turn');
    const invocationId = derivedId(request.requestId, 'invocation');
    const brief = bound.brief ?? (await engine.brief(subject, bound.attemptId, invocationId));
    if (bound.fresh) {
      await ensureFreshSession(sessions, request, {
        attemptId: bound.attemptId,
        actor: bound.actor,
        ...(bound.effort !== undefined ? { effort: bound.effort } : {}),
      });
    } else if (subject.kind === 'task') {
      // A Session that continues into a Task's step belongs to that Task too.
      await sessions.associateTasks(sessionId, subject.specId, [subject.taskId]);
    }

    if (!(await sessions.hasTurn(sessionId, turnId))) {
      const message = [
        brief.text,
        ...(request.message !== undefined
          ? ['', '## Note from the owner', untrusted('owner', request.message)]
          : []),
      ].join('\n');
      await sessions.start(
        request.principal,
        sessionId,
        {
          requestId: derivedId(request.requestId, 'turn-request'),
          message,
          mode: 'workspace-write',
        },
        {
          ids: { turnId, invocationId },
          agentAttempt: { attemptId: bound.attemptId },
          // The archetype's allowlist for this provider, else the default (D20): only for this
          // Turn. An absent or empty allow means no list of its own.
          agentPermissions: { allow: await allowlistOf(bound.actor) },
        },
      );
    }

    return {
      kind: bound.kind,
      subject,
      attemptId: bound.attemptId,
      step: brief.step.id,
      attempt: brief.attempt,
      sessionId,
      turnId,
      session: bound.fresh ? 'fresh' : 'reuse',
    };
  }

  async function startAgentStepExecution(
    request: AgentStepExecutionRequest,
  ): Promise<AgentStepExecutionResult> {
    const { subject, expected } = request;
    const sessions = dependencies.sessions();
    const invocationId = derivedId(request.requestId, 'invocation');
    const turnId = derivedId(request.requestId, 'turn');
    const continuing = expected.attempt !== undefined;
    const active = await engine.activeAttempt(subject);
    const retry = active?.journal.turns.some((turn) => turn.invocationId === invocationId);
    if (active && retry) {
      if (!sessions) {
        unavailable(
          { kind: 'unavailable', reason: 'provider-not-ready' },
          'Managed agent Sessions are not enabled in this Runtime.',
        );
      }

      // The Engine bound this request's Turn already: complete what a failure left out.
      return dispatch(sessions, request, {
        attemptId: active.attemptId,
        actor: active.journal.actor,
        fresh: !continuing && active.launch?.session === 'fresh',
        ...(active.launch?.effort !== undefined ? { effort: active.launch.effort } : {}),
        kind: continuing ? 'continued' : 'started',
      });
    }

    let launch: AgentLaunch;
    let actor: AgentActor;
    if (continuing) {
      if (active?.step !== expected.step || active.attempt !== expected.attempt) {
        throw new WorkflowError(
          'WORKFLOW_ATTEMPT_MISMATCH',
          `The step ${expected.step} has no agent attempt ${String(expected.attempt)} to continue.`,
        );
      }

      if (request.provider ?? request.model ?? request.effort) {
        invalid('A continued Session keeps its agent and model.');
      }

      const option = await continueOption(active, subject, await turnState(active), true);
      if (option.kind === 'unavailable') {
        unavailable(option, 'The agent cannot continue this attempt now.');
      }

      launch = option.launch;
      actor = active.journal.actor;
      if (sessions && active.launch?.session === 'fresh') {
        // A fresh Session a failed create left missing is made now, before another Turn is bound.
        await ensureFreshSession(sessions, request, {
          attemptId: active.attemptId,
          actor,
          ...(active.launch.effort !== undefined ? { effort: active.launch.effort } : {}),
        });
      }
    } else {
      const next = nextOf(await engine.actions(subject));
      if (next?.step.id !== expected.step) {
        throw new WorkflowError(
          'WORKFLOW_ATTEMPT_MISMATCH',
          `The run is not ready to start ${expected.step}.`,
        );
      }

      if (next.agent.kind === 'unavailable') {
        unavailable(next.agent, 'An agent cannot do this step now.');
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

      // Judged with the agent the owner chose, the checkout's baseline included.
      const option = await judged(
        { ...next.agent, launch: chosen },
        subject,
        { step: next.step.id },
        true,
      );
      if (option.kind === 'unavailable') {
        unavailable(option, 'An agent cannot do this step now.');
      }

      launch = chosen;
      actor = {
        class: 'agent',
        details: {
          archetype: launch.archetype,
          provider: launch.provider,
          model: launch.model,
          sessionId:
            launch.session.mode === 'reuse'
              ? launch.session.sessionId
              : derivedId(request.requestId, 'session'),
        },
      };
    }

    if (!sessions) {
      unavailable(
        { kind: 'unavailable', reason: 'provider-not-ready', launch },
        'Managed agent Sessions are not enabled in this Runtime.',
      );
    }

    const workspaceId = await engine.workspaceIdOf(subject.specId);
    if (workspaceId === undefined) {
      throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'The Specification is not available.');
    }

    const fresh = launch.session.mode === 'fresh' && !continuing;
    // Nothing exists yet: a refusal here leaves no attempt, no Session and no Turn.
    const { attemptId, brief } = await engine.start({
      subject,
      actor,
      expected,
      workspaceId,
      turn: { invocationId, turnId },
      ...(continuing
        ? {}
        : {
            launch: {
              session: fresh ? 'fresh' : 'reuse',
              ...(launch.effort !== undefined ? { effort: launch.effort } : {}),
            },
          }),
    });

    return dispatch(sessions, request, {
      attemptId,
      brief,
      actor,
      fresh,
      ...(launch.effort !== undefined ? { effort: launch.effort } : {}),
      kind: continuing ? 'continued' : 'started',
    });
  }

  /**
   * Stop (D19): cancels the agent attempt's running Turn. The claim stays held until the agent's
   * process is proven stopped; then the Turn's settlement finalizes the attempt as a Turn that ended.
   */
  async function stopAgentStepExecution(request: {
    readonly subject: WorkflowSubject;
    readonly principal: string;
    readonly requestId: string;
    readonly attemptId: string;
  }): Promise<StopAgentStepExecutionResult> {
    const sessions = dependencies.sessions();
    const active = await engine.activeAttempt(request.subject);
    if (active?.attemptId !== request.attemptId) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'This agent attempt is not the active attempt any more.',
      );
    }

    const turn = active.journal.turns.at(-1);
    const sessionId = active.journal.actor.details.sessionId;
    if (!turn || !sessionId || !sessions) {
      throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'The agent is not working now.');
    }

    await sessions.cancel(request.principal, sessionId, turn.turnId, request.requestId);

    return { attemptId: active.attemptId, sessionId, turnId: turn.turnId };
  }

  /**
   * The owner's Return (D19, A2). With no agent Turn that may still run, the return applies now.
   * Otherwise the Engine records it on the attempt and the Turn is cancelled here; the claim stays
   * held until the agent's process is proven stopped, and the Turn's finalize then applies the
   * return. A Turn that cannot be cancelled now (its outcome unknown, or it ended meanwhile) keeps
   * the recorded request: the finalize applies it whenever the claim settles.
   */
  async function returnStep(
    input: ReturnToStepInput,
    principal: string,
  ): Promise<OwnerReturnResult> {
    const result = await engine.returnStep(input);
    if (result.kind !== 'return-requested') {
      return result;
    }

    const sessions = dependencies.sessions();
    if (!sessions || result.sessionId === '') {
      return { ...result, stop: 'failed' };
    }

    try {
      await sessions.cancel(
        principal,
        result.sessionId,
        result.turnId,
        derivedId(`${result.attemptId}:${result.requestedAt}`, 'return-stop'),
      );

      return { ...result, stop: 'sent' };
    } catch (error) {
      if (!(error instanceof SessionError)) {
        throw error;
      }

      // Not stopped now (its outcome unknown, or the Session cannot be reached): Stop again.
      return { ...result, stop: 'failed' };
    }
  }

  /** Take over (F17): the Engine refuses it while the agent's process may still run. */
  function takeOver(input: TakeOverAgentAttemptInput): Promise<TakeOverAgentAttemptResult> {
    return engine.takeOver(input);
  }

  return { decorate, check, startAgentStepExecution, stopAgentStepExecution, returnStep, takeOver };
}

export type AgentStepExecution = ReturnType<typeof createAgentStepExecution>;
