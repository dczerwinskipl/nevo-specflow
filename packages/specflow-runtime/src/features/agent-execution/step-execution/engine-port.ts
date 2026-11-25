import {
  AttributionRefusalError,
  activeAgentAttempt,
  admitAgentTurn,
  agentAttemptScope,
  inspectActionsForRead,
  inspectWorkspaceExecution,
  listUnsettledWorkspaceExecutions,
  readAgentAttemptWork,
  readAgentTurnContext,
  readExecutionSnapshotForRead,
  resolveSpecificationForRead,
  returnDuringAgentAttempt,
  startAgentAttempt,
  takeOverAgentAttempt,
  WorkflowError,
  type ActionProjection,
  type AgentActor,
  type AgentAttemptDependencies,
  type AgentAttemptJournal,
  type AgentAttemptWork,
  type OwnerReturnResult,
  type ProjectHold,
  type ReturnToStepInput,
  type TakeOverAgentAttemptInput,
  type TakeOverAgentAttemptResult,
  type ExpectedPosition,
  type SpecFlowEngine,
  type StepContext,
  type WorkflowDependencies,
  type WorkflowSubject,
} from '@nevo/specflow-engine';

import { renderAgentBrief } from '../brief/render';
import { projectHoldOf } from './project-hold';
import type { AgentRuntimeFacts } from './availability';

/** The agent attempt the subject's active step is in, as the Engine recorded it. */
export interface ActiveAgentAttempt {
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly step: string;
  readonly attempt: number;
  readonly launch?: { readonly session: 'fresh' | 'reuse'; readonly effort?: string };
  readonly journal: AgentAttemptJournal;
}

/**
 * What agent step execution needs from the Engine. Every read but `baseline` is free of Git (the
 * projection read path); `baseline` reads the checkout's status and runs only for the explicit
 * check and the start.
 */
export interface AgentStepEngine {
  actions(subject: WorkflowSubject): Promise<ActionProjection>;
  activeAttempt(subject: WorkflowSubject): Promise<ActiveAgentAttempt | undefined>;
  /** The phase of an execution claim, `undefined` when none exists. */
  claimPhase(
    invocationId: string,
  ): Promise<'admitted' | 'dispatched' | 'unknown' | 'settled' | undefined>;
  /** An unsettled writer claim of the project, worded for the owner. */
  busyWriter(): Promise<AgentRuntimeFacts['busy']>;
  /**
   * The agent holding the project now: the unsettled execution claim of an agent attempt's Turn
   * (`unknown` first), with what it works on. Git-free: the claims and the attempt's journal.
   */
  projectHold(): Promise<ProjectHold | undefined>;
  workspaceIdOf(specId: string): Promise<string | undefined>;
  /** The permission rules the archetype lists for a provider (D20); absent when it lists none. */
  archetypeAllowlist(archetype: string, provider: string): Promise<readonly string[] | undefined>;
  /** The baseline refusal of a Turn at `expected` (reads Git). */
  baseline(
    subject: WorkflowSubject,
    workspaceId: string,
    expected: ExpectedPosition,
  ): Promise<AgentRuntimeFacts['baseline']>;
  /**
   * Starts the attempt (or binds Continue's Turn) with the trusted agent actor, and renders the
   * Turn's brief from the context the start read and recorded the digest of.
   */
  start(input: {
    readonly subject: WorkflowSubject;
    readonly actor: AgentActor;
    readonly expected: ExpectedPosition;
    readonly workspaceId: string;
    readonly turn: {
      readonly invocationId: string;
      readonly turnId: string;
      readonly requestDigest: string;
    };
    readonly launch?: { readonly session: 'fresh' | 'reuse'; readonly effort?: string };
  }): Promise<{ readonly attemptId: string; readonly brief: AgentBrief }>;
  /** What the attempt left so far (Git-free: its journal, the ledger and the Task manifests). */
  work(subject: WorkflowSubject, active: ActiveAgentAttempt): Promise<AgentAttemptWork>;
  /** The owner's Return (D19, A2): applied now, or recorded on the agent attempt. */
  returnStep(input: ReturnToStepInput): Promise<OwnerReturnResult>;
  /** Take over (F17): the agent attempt ends `taken-over`, the owner's attempt starts. */
  takeOver(input: TakeOverAgentAttemptInput): Promise<TakeOverAgentAttemptResult>;
  /**
   * The brief of a bound Turn whose dispatch is completed later (a retry): rendered from the context
   * now, refused (`WORKFLOW_STATE_CONFLICT`) unless it is the context the Turn was bound with.
   */
  brief(subject: WorkflowSubject, attemptId: string, invocationId: string): Promise<AgentBrief>;
}

/** The brief of one Turn: the step it works on and the text the agent is sent. */
export interface AgentBrief {
  readonly step: { readonly id: string; readonly title: string };
  readonly attempt: number;
  /** The Task subject, with its title. */
  readonly task?: { readonly id: string; readonly title: string };
  /** What the previous step handed over (the brief shows it as text too). */
  readonly handoff?: StepContext['handoff'];
  readonly text: string;
}

/** The baseline refusals of a Turn's start, as the agent option's reason. */
const BASELINE_REASONS: Partial<
  Record<string, NonNullable<AgentRuntimeFacts['baseline']>['reason']>
> = {
  WORKFLOW_DIRTY_BASELINE: 'dirty-baseline',
  WORKFLOW_BASELINE_CHANGED: 'baseline-changed',
  WORKFLOW_OWNER_WORK_UNCOMMITTED: 'owner-work-uncommitted',
};

/** The production port over an opened Engine. */
export function createAgentStepEngine(dependencies: {
  readonly engine: SpecFlowEngine;
  readonly openWorkflow: () => Promise<WorkflowDependencies>;
  readonly openAttempts: () => Promise<AgentAttemptDependencies>;
}): AgentStepEngine {
  const { engine } = dependencies;

  /** The title of a subject: a Task's from the execution store, a Specification's from its manifest. */
  async function titleOf(
    attempts: AgentAttemptDependencies,
    subject: WorkflowSubject,
  ): Promise<string> {
    if (subject.kind === 'task') {
      const snapshot = await readExecutionSnapshotForRead(attempts.workflow, subject.specId);

      return (
        snapshot.manifests.find((entry) => entry.value.id === subject.taskId)?.value.title ??
        subject.taskId
      );
    }

    const found = await resolveSpecificationForRead(engine, subject.specId);

    return found.status === 'available' ? found.specification.title : subject.specId;
  }

  async function rendered(
    attempts: AgentAttemptDependencies,
    attemptId: string,
    context: StepContext,
  ): Promise<AgentBrief> {
    const scope = (await agentAttemptScope(attempts, attemptId))?.scope;
    if (!scope) {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The agent attempt has no journal.');
    }

    return {
      step: { id: context.step.id, title: context.step.title },
      attempt: context.attempt,
      ...(context.task ? { task: { id: context.task.id, title: context.task.title } } : {}),
      ...(context.handoff ? { handoff: context.handoff } : {}),
      text: renderAgentBrief({ context, scope }),
    };
  }

  return {
    actions: async (subject) => inspectActionsForRead(await dependencies.openWorkflow(), subject),
    async activeAttempt(subject) {
      const active = await activeAgentAttempt(await dependencies.openWorkflow(), subject);
      const journal = active
        ? await (await dependencies.openAttempts()).journal.read(active.attemptId)
        : undefined;

      return active && journal ? { ...active, journal } : undefined;
    },
    claimPhase: async (invocationId) =>
      (await inspectWorkspaceExecution(engine, invocationId))?.phase,
    async busyWriter() {
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
    },
    async projectHold() {
      const page = await listUnsettledWorkspaceExecutions(engine, { limit: 20 });
      if (!page.items.some((record) => record.phase !== 'settled' && record.intent.attempt)) {
        return undefined;
      }

      const attempts = await dependencies.openAttempts();

      return projectHoldOf(page.items, {
        journal: (attemptId) => attempts.journal.read(attemptId),
        title: (subject) => titleOf(attempts, subject),
      });
    },
    async archetypeAllowlist(archetype, provider) {
      return (await dependencies.openWorkflow()).catalogue
        .archetype(archetype)
        ?.providers.find((entry) => entry.provider === provider)?.permissions?.allow;
    },
    async workspaceIdOf(specId) {
      const found = await resolveSpecificationForRead(engine, specId);

      return found.status === 'available' ? found.workspaceId : undefined;
    },
    async baseline(subject, workspaceId, expected) {
      try {
        await admitAgentTurn(await dependencies.openAttempts(), { subject, workspaceId, expected });

        return undefined;
      } catch (error) {
        const reason =
          error instanceof AttributionRefusalError ? BASELINE_REASONS[error.code] : undefined;
        if (error instanceof AttributionRefusalError && reason !== undefined) {
          return {
            reason,
            // The Engine's sentence: which files and what to do about them.
            detail: error.message,
            paths: [...error.attribution.paths],
            count: error.attribution.count,
          };
        }

        throw error;
      }
    },
    async start(input) {
      const workflow = await dependencies.openWorkflow();
      const attempts = await dependencies.openAttempts();
      const started = await startAgentAttempt(attempts, {
        ...input,
        ...(input.subject.kind === 'specification'
          ? { archetype: await workflow.references.archetype(input.subject.specId) }
          : {}),
      });
      const { attemptId } = started.binding;

      return { attemptId, brief: await rendered(attempts, attemptId, started.context) };
    },
    async work(_subject, active) {
      const attempts = await dependencies.openAttempts();

      return readAgentAttemptWork(attempts.workflow, attempts, active.journal);
    },
    returnStep: async (input) => returnDuringAgentAttempt(await dependencies.openAttempts(), input),
    takeOver: async (input) => takeOverAgentAttempt(await dependencies.openAttempts(), input),
    async brief(subject, attemptId, invocationId) {
      const attempts = await dependencies.openAttempts();
      const context = await readAgentTurnContext(attempts, { subject, attemptId, invocationId });

      return rendered(attempts, attemptId, context);
    },
  };
}
