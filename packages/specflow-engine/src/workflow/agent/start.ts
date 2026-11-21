import { activeAttempt } from '@nevo/workflow';

import { WorkflowError } from '../errors';
import { assertActorShape } from '../input-schema';
import { isoNow, loadSubject } from '../operations/loaded-execution';
import {
  startSpecificationInSection,
  startTaskInSection,
  type ExpectedPosition,
  type StartResult,
} from '../operations/start';
import type { AgentStepContext } from '../operations/agent-step-context';
import type { StepContext } from '../operations/step-context';
import {
  agentAttemptBindingOf,
  type AgentActor,
  type AgentAttemptBinding,
  type WorkflowSubject,
} from '../state/model';
import { admitAgentTurn } from './boundary';
import { agentContextInSection, stepContextInSection } from './context/read';
import type { AgentAttemptDependencies } from './dependencies';
import {
  AGENT_ATTEMPT_JOURNAL_VERSION,
  AGENT_ATTEMPT_TURNS_MAX,
  type AgentAttemptJournal,
  type AgentTurnBinding,
} from './journal/model';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface StartAgentAttemptInput {
  readonly subject: WorkflowSubject;
  /** The Specification's archetype; used only by the first start of a Specification run. */
  readonly archetype?: string;
  /** For a Task's first start: the workflow revision the owner was shown (`startTaskExecution`). */
  readonly expectedWorkflowRevision?: string;
  /** From the trusted Runtime binding; the attempt is worked on and resumed only by its Session. */
  readonly actor: AgentActor;
  /**
   * The position the owner asked the agent to work on: a new attempt of `step`, or (Continue) the
   * active attempt `step#attempt`. A stale one refuses before anything is written.
   */
  readonly expected: ExpectedPosition;
  /** The registered checkout the attempt works in. */
  readonly workspaceId: string;
  /** The Turn about to be dispatched: its Runtime invocation and Session Turn ids. */
  readonly turn: { readonly invocationId: string; readonly turnId: string };
  /** The launch of a new attempt (D18): fresh or continued Session, and the chosen effort. */
  readonly launch?: { readonly session: 'fresh' | 'reuse'; readonly effort?: string };
}

export interface StartAgentAttemptResult {
  readonly kind: 'started' | 'resumed';
  readonly subject: WorkflowSubject;
  /**
   * The step context the Turn is briefed with, its agent data included: read in the start's section,
   * so its Task context digest is the one recorded on the attempt (a new attempt) and on the Turn.
   */
  readonly context: StepContext & { readonly agent: AgentStepContext };
  /** The attempt's binding, as recorded on the attempt. */
  readonly binding: AgentAttemptBinding;
}

function invalidInput(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

function assertBindingInput(input: StartAgentAttemptInput): void {
  assertActorShape(input.actor);
  if (input.actor.class !== 'agent' || !input.actor.details.sessionId) {
    throw new WorkflowError(
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
      'An agent attempt is worked on by an agent in a Session.',
    );
  }

  if (!UUID.test(input.workspaceId) || !UUID.test(input.turn.invocationId)) {
    invalidInput('The workspace and the invocation of an agent attempt are UUIDs.');
  }

  if (!input.turn.turnId || input.turn.turnId.length > 200) {
    invalidInput('The Turn of an agent attempt has an id of at most 200 characters.');
  }
}

/**
 * Start an agent attempt (agent step execution), or continue the active one with a new Turn (`expected` names
 * it). Runs before any Session, claim or provider process exists: a subject that is not ready, a
 * stale expected position or a step whose executors do not include `agent` refuses with nothing
 * written, and so does a checkout whose baseline the Engine cannot attribute (`admitAgentTurn`:
 * `WORKFLOW_DIRTY_BASELINE` for a new attempt, `WORKFLOW_BASELINE_CHANGED` for Continue). In one `serialize` section the ordinary start records the attempt with its binding
 * (`AgentAttemptBinding`, committed with the run), then the attempt's local journal records the
 * Turn's binding. A crash between the two leaves an active attempt with no process and no Turn; the
 * same Session continues it, which records the journal then.
 *
 * Every write is refused while an agent execution claim is unsettled, the previous Turn's included,
 * so a Turn is bound only once the one before it settled.
 */
export async function startAgentAttempt(
  dependencies: AgentAttemptDependencies,
  input: StartAgentAttemptInput,
): Promise<StartAgentAttemptResult> {
  assertBindingInput(input);
  const { subject } = input;
  const attemptId = dependencies.newId();
  // The start's own store change is the attempt's, made for its first Turn: its ledger entries name
  // that Turn, so the attempt commit takes them with the rest of the attempt (D15).
  const workflow = {
    ...dependencies.workflow,
    store: dependencies.attributedStore(input.turn.invocationId),
  };

  return workflow.serialize(async () => {
    // The context is read once, here: the brief is rendered from it and its digest is recorded, so
    // what the attempt and its Turn record is what the agent is briefed with.
    const agent = await agentContextInSection(workflow, dependencies.context, subject);
    const contextDigest = agent.taskContext?.digest;
    const attemptData: AgentAttemptBinding = {
      kind: 'agent-attempt',
      attemptId,
      workspaceId: input.workspaceId,
      ...(contextDigest !== undefined ? { contextDigest } : {}),
      ...(input.launch !== undefined
        ? {
            launch: {
              session: input.launch.session,
              ...(input.launch.effort !== undefined ? { effort: input.launch.effort } : {}),
            },
          }
        : {}),
    };
    const options = {
      actor: input.actor,
      expected: input.expected,
      attemptData,
      // B3: once the start's own checks passed, the Turn must start from a baseline the Engine can
      // attribute, before anything is written.
      admit: () =>
        admitAgentTurn(dependencies, {
          subject,
          workspaceId: input.workspaceId,
          expected: input.expected,
        }),
    };
    let started: StartResult;
    if (subject.kind === 'task') {
      started = await startTaskInSection(workflow, {
        ...options,
        specId: subject.specId,
        taskId: subject.taskId,
        ...(input.expectedWorkflowRevision !== undefined
          ? { expectedWorkflowRevision: input.expectedWorkflowRevision }
          : {}),
      });
    } else {
      if (input.archetype === undefined) {
        invalidInput('The first start of a Specification run names its archetype.');
      }

      started = await startSpecificationInSection(workflow, {
        ...options,
        specId: subject.specId,
        archetype: input.archetype,
      });
    }

    // `expected` refuses a terminal run before the start, so this start activated or resumed one.
    if (started.kind === 'terminal') {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'An agent start reached no attempt.');
    }

    const binding = await bindTurn(dependencies, input, contextDigest);

    return { kind: started.kind, subject, context: { ...started.context, agent }, binding };
  });
}

/** Record the Turn in the active attempt's journal (inside the start's section). */
async function bindTurn(
  dependencies: AgentAttemptDependencies,
  input: StartAgentAttemptInput,
  contextDigest: string | undefined,
): Promise<AgentAttemptBinding> {
  const { workflow } = dependencies;
  // A resume writes nothing in the store, so the journal write is admitted on its own.
  await dependencies.admission(undefined).admitWrite();
  const snapshot = await workflow.store.read(input.subject.specId);
  const run = loadSubject(workflow.catalogue, snapshot, input.subject).run;
  const active = activeAttempt(run);
  const binding = agentAttemptBindingOf(active);
  if (!active || run.position.state !== 'active') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'An agent start left no active attempt.');
  }

  if (!binding) {
    throw new WorkflowError(
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
      `The active attempt of "${active.step}" was not started by agent step execution; it cannot get a new Turn.`,
    );
  }

  if (binding.workspaceId !== input.workspaceId) {
    throw new WorkflowError(
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
      `The attempt ${active.step}#${String(active.attempt)} works in another checkout.`,
    );
  }

  const turn: AgentTurnBinding = {
    ...input.turn,
    boundAt: isoNow(workflow),
    ...(contextDigest !== undefined ? { contextDigest } : {}),
  };
  const journal = await dependencies.journal.read(binding.attemptId);
  if (!journal) {
    await dependencies.journal.publish({
      version: AGENT_ATTEMPT_JOURNAL_VERSION,
      operationId: binding.attemptId,
      subject: input.subject,
      step: active.step,
      attempt: active.attempt,
      actor: active.actor as AgentActor,
      workspaceId: binding.workspaceId,
      turns: [turn],
    });

    return binding;
  }

  const known = journal.turns.find((entry) => entry.invocationId === turn.invocationId);
  if (known) {
    // A retry of this Turn's start is the same binding; an earlier Turn is never bound again.
    if (known !== journal.turns.at(-1) || known.turnId !== turn.turnId) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'This invocation was bound to another Turn of the attempt already.',
      );
    }

    assertBriefedContext(known, contextDigest);

    return binding;
  }

  if (journal.turns.length >= AGENT_ATTEMPT_TURNS_MAX) {
    invalidInput(`An agent attempt takes at most ${String(AGENT_ATTEMPT_TURNS_MAX)} Turns.`);
  }

  const next: AgentAttemptJournal = { ...journal, turns: [...journal.turns, turn] };
  await dependencies.journal.publish(next);

  return binding;
}

/**
 * A Turn is briefed with exactly the context it was bound with: the Task context digest recorded on
 * the Turn. A context that changed since (a document or a referenced file edited before the Turn was
 * dispatched) is refused; Continue binds a new Turn briefed with the current context.
 */
function assertBriefedContext(turn: AgentTurnBinding, contextDigest: string | undefined): void {
  if (turn.contextDigest !== contextDigest) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CONFLICT',
      'The Task context changed after this Turn was bound, so the agent would not be briefed with ' +
        'what the attempt records; continue the attempt to brief it with the current context.',
    );
  }
}

/** The Turn `invocationId` of the agent attempt `attemptId`, to brief it again. */
export interface AgentTurnContextInput {
  readonly subject: WorkflowSubject;
  readonly attemptId: string;
  readonly invocationId: string;
}

/**
 * The step context to brief a bound Turn with when its dispatch is completed later (a retry after a
 * failure between the start and the dispatch): read now, and refused (`WORKFLOW_STATE_CONFLICT`)
 * unless its Task context digest is the one the Turn was bound with. Read-only.
 */
export function readAgentTurnContext(
  dependencies: AgentAttemptDependencies,
  input: AgentTurnContextInput,
): Promise<StepContext & { readonly agent: AgentStepContext }> {
  const { workflow } = dependencies;

  return workflow.serialize(async () => {
    const journal = await dependencies.journal.read(input.attemptId);
    const turn = journal?.turns.find((entry) => entry.invocationId === input.invocationId);
    if (!journal || !turn || journal.subject.specId !== input.subject.specId) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        'This Turn is not bound to the agent attempt.',
      );
    }

    const context = await stepContextInSection(workflow, dependencies.context, input.subject);
    const agent = context.agent!;
    assertBriefedContext(turn, agent.taskContext?.digest);

    return { ...context, agent };
  });
}
