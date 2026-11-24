import {
  activeAttempt,
  awaitingAttempt,
  findStep,
  handoffOf,
  newRun,
  type Handoff,
  type TerminalOutcome,
} from '@nevo/workflow';
import {
  resolveContinuation,
  type AttentionReason,
  type AgentLaunch,
  type ContinuationDecision,
  type LaunchBlocker,
} from '../continuation/resolve';
import type { SpecificationLifecycleActions } from '../close/blockers';
import { resolveSpecificationExecution, type ExecutionCatalogue } from '../definitions/catalogue';
import type { TaskTypes, WorkflowDefinition, WorkflowStep } from '../definitions/model';
import { WorkflowError } from '../errors';
import type { TaskProposal } from '../tasks/tasks';
import type { TaskResourceIssue } from '../../tasks/resource/validate';
import type {
  ExecutionTask,
  PendingOwnerDecisions,
  WorkflowActor,
  WorkflowRun,
  WorkflowSubject,
} from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import {
  finishClosingOpenTasks,
  isTaskClosed,
  isTaskTypeAllowed,
  ownsDraft,
  resolveTaskType,
  taskReadiness,
  tasksOpenAtCompletion,
  unsatisfiableDependencies,
  type ClosableTask,
  type OpenTask,
} from '../tasks/tasks';
import { continuationOf, waitDecision } from './advance';
import { confirmsDigestOf, resultConfirmsOf } from './confirms';
import { deriveAttention, startBlockerAttention } from './attention';
import type { AttentionItem } from '../attention/model';
import type { BlockingTask } from '../tasks/tasks';
import {
  executionTasks,
  loadTask,
  pinnedDefinitionIfUnchanged,
  type ExecutionHolds,
  type ExecutionTasks,
  type WorkflowDependencies,
} from './loaded-execution';
import type {
  AttemptCommitWait,
  SpecificationAttemptCommitWait,
} from '../../specs/uncommitted/attempts';
import {
  describeStep,
  describeTransitions,
  type StepDescription,
  type TransitionDescription,
} from './step-context';
import { effectiveTaskTypesOf, isAwaited, unresolvedContext } from './task-policy';
import {
  createTaskAvailability,
  taskAuthoringOf,
  taskLifecycleOf,
  unavailable,
  type Availability,
  type TaskActionUnavailableReason,
  type TaskAuthoringFacts,
  type TaskLifecycleActions,
} from './task-authoring';
import { entryGatesOf, exitGatesFor, type GateStatus } from '../gates/evaluate';
import { evaluateGates, type GateDocuments } from '../gates/read';
import type { StartBlocker } from './start-blockers';
import {
  documentRelationsOf,
  type DocumentRelation,
  type RelationSteps,
} from '../gates/document-relations';
import { onlyTarget, outlineOf, type OutlinePosition, type WorkflowOutline } from './outline';
import { forOneRead, type TaskReferences } from './task-references';

export type { StartBlocker } from './start-blockers';
export type {
  Availability,
  TaskActionUnavailableReason,
  TaskLifecycleActions,
} from './task-authoring';

/**
 * The read-only action projection (E4a): where a Specification or a Task stands and what the owner
 * may do now. Surfaces (HTTP, CLI, UI) render only what it allows; it never mutates to find out (no
 * store write, no attempt activation). It asks the rules the commands apply (`taskReadiness`,
 * `resolveTaskType`, `taskDecisionRefusal`, the continuation of a ready run), so a projected action
 * is refused only when the state changed in between.
 *
 * A pending Task document change (D03) refuses every change that writes the Task's folder: the
 * status decisions, the edits, the removal and an escalating finish. A start writes only the run
 * record, so it is not refused.
 */

/** The workflow a run is pinned to, or the one a first start would pin. */
export interface WorkflowSummary {
  readonly workflowId: string;
  readonly version: number;
  readonly revision: string;
  readonly title: string;
}

/** What a first start would pin, from the live definitions (D04): confirm it, then start. */
export interface PinPreview extends WorkflowSummary {
  readonly firstStep: string;
  readonly firstStepTitle: string;
  /**
   * The steps a start would pin, in declared order, each with where its transitions lead (step ids;
   * `end` for a terminal target). A client that confirmed an earlier preview names what changed.
   */
  readonly steps: readonly PreviewStep[];
}

export interface PreviewStep {
  readonly id: string;
  readonly title: string;
  readonly next: readonly string[];
}

export const AGENT_UNAVAILABLE_REASONS = [
  /** The step is done by a person only. */
  'not-an-executor',
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
  /** D10: the transition reuses the Session, but a person finished the previous attempt. */
  'session-unavailable',
] as const satisfies readonly (LaunchBlocker | 'not-an-executor')[];

/**
 * The reasons only the Runtime knows, which it adds to the projection it serves (explain before
 * action; the contracts' `AGENT_UNAVAILABLE_REASONS` documents each). The Engine never reports them.
 */
export const RUNTIME_AGENT_UNAVAILABLE_REASONS = [
  'provider-not-ready',
  'dirty-baseline',
  'baseline-changed',
  'owner-work-uncommitted',
  'project-busy',
  'demo',
] as const;
/**
 * With Git on, an agent attempt of the Specification waits for its own commit (D15): a new agent
 * start is refused `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` meanwhile (`detail`: the failure's code).
 */
export const ATTEMPT_COMMIT_AGENT_UNAVAILABLE_REASONS = [
  'attempt-commit-pending',
  'attempt-commit-failed',
] as const;
export type AgentUnavailableReason =
  | (typeof AGENT_UNAVAILABLE_REASONS)[number]
  | (typeof RUNTIME_AGENT_UNAVAILABLE_REASONS)[number]
  | (typeof ATTEMPT_COMMIT_AGENT_UNAVAILABLE_REASONS)[number];

/**
 * Whether an agent could do the step, and how agent step execution would launch it: the agent role, provider,
 * model and Session the kernel's continuation resolves (D18), `independent` for a step whose
 * archetype is independent (always a fresh Session). The owner may change provider and model only
 * for a fresh Session. Never dispatched by the Engine itself.
 */
export type AgentOption =
  | {
      readonly kind: 'available';
      readonly launch: AgentLaunch;
      readonly independent?: true;
      /**
       * The Runtime did not read the checkout for this answer (`unchecked`: the projection never runs
       * Git); its explicit check and the start judge the baseline.
       */
      readonly baseline?: 'unchecked';
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: AgentUnavailableReason;
      /** Runtime reasons: what precisely blocks it (the provider's readiness, the holder). */
      readonly detail?: string;
      /** `dirty-baseline`, `baseline-changed`, `owner-work-uncommitted`: the first paths of `count`. */
      readonly paths?: readonly string[];
      readonly count?: number;
      /** The launch once the blocker is resolved (a Runtime reason over a resolved launch). */
      readonly launch?: AgentLaunch;
      readonly independent?: true;
    };

/**
 * What an agent attempt left (partial work is never rolled back, D19): what SpecFlow wrote for it
 * and has not committed, the Task drafts it produced, the files it declared and what was changed in
 * the checkout when its last Turn ended, and whether its own commit ran. Git-free: read from the
 * attempt's journal, the uncommitted-changes ledger and the Task manifests.
 *
 * - `documents`: uncommitted files SpecFlow wrote only for the attempt's Turns (documents and Task
 *   files), checkout-relative and sorted; `mixed`: those someone else changed too;
 * - `tasks`: the Task drafts the attempt's step produced in this attempt, in id order;
 * - `declared`: the changed files outside SpecFlow's folders its proposal declared;
 * - `changed`: what was uncommitted in the checkout when its last Turn's claim settled;
 * - `commit`: its attempt commit (D15): `none` (it did not finish with its own result: returned,
 *   taken over or still active), `pending`, `committed` or `failed` (with the code, retry possible).
 */
export interface AgentAttemptWork {
  readonly documents: readonly string[];
  readonly mixed: readonly string[];
  readonly tasks: readonly string[];
  readonly declared: readonly string[];
  readonly changed?: { readonly paths: readonly string[]; readonly truncated?: true };
  readonly commit: {
    readonly state: 'none' | 'pending' | 'committed' | 'failed';
    readonly code?: string;
    /** How many times it ran (a retry is a run). */
    readonly runs?: number;
    /**
     * `committed` with a commit: its sha (absent when every path already equalled HEAD), and how many
     * of its paths are SpecFlow's (`documents`) and the agent's declared files (`files`).
     */
    readonly sha?: string;
    readonly documents?: number;
    readonly files?: number;
  };
}

/**
 * The agent attempt of the active step (agent step execution), as the Runtime serves it: the Engine journal of
 * the attempt and the state of its current Turn's claim. Only the Runtime adds it.
 */
export interface AgentAttemptView {
  readonly attemptId: string;
  readonly step: string;
  readonly attempt: number;
  readonly sessionId: string;
  readonly provider: string;
  readonly model?: string;
  readonly turn: {
    readonly turnId: string;
    readonly state: 'working' | 'stopping' | 'unknown' | 'ended' | 'session-missing';
    readonly boundAt: string;
    readonly endedAt?: string;
  };
  readonly turns: number;
  readonly proposal?: {
    readonly transition: string;
    readonly state: 'pending' | 'refused' | 'finalized';
    readonly submittedAt: string;
    readonly refusal?: {
      readonly code: string;
      readonly message: string;
      readonly paths?: readonly string[];
    };
  };
  /** Whether Continue can start now. */
  readonly continue: AgentOption;
  /**
   * The owner's return during the attempt (D19, A2): `requested` while the Turn may still run (it is
   * applied once the agent's process is proven stopped), `refused` when applying it was refused.
   */
  readonly returnRequest?: {
    readonly to: string;
    readonly requestedAt: string;
    readonly state: 'requested' | 'refused';
    readonly refusal?: { readonly code: string; readonly message: string };
    /**
     * While `requested`: the Turn is stopping (`sent`), or it still runs or cannot be told
     * (`failed`: the owner can Stop again).
     */
    readonly stop?: 'sent' | 'failed';
    /**
     * While `requested` and no Turn runs any more (it was abandoned before it ran): the return
     * applies at the owner's next action on the attempt (Return, Take over); nothing is written on
     * a read.
     */
    readonly appliesOn?: 'next-action';
  };
  /**
   * Whether Take over (F17) is possible now: only once the agent's process is proven ended
   * (`agent-working`: its Turn runs or is stopping; `outcome-unknown`: SpecFlow cannot tell whether
   * it still runs; `return-requested`: the owner's return waits to apply).
   */
  readonly takeOver:
    | { readonly kind: 'available' }
    | {
        readonly kind: 'unavailable';
        readonly reason: 'agent-working' | 'outcome-unknown' | 'return-requested';
      };
  /** What the attempt left so far (nothing is rolled back). */
  readonly work: AgentAttemptWork;
}

/** The step a start would activate, with who may do it. */
export interface StartableStep {
  readonly step: StepDescription;
  /** A person may do the step (the owner's start). */
  readonly human: boolean;
  readonly agent: AgentOption;
  /** The step's entry gates with their status now; absent when it declares none. */
  readonly entryGates?: readonly GateStatus[];
}

export type ActionPosition =
  | { readonly kind: 'not-started'; readonly preview: PinPreview; readonly next: StartableStep }
  | { readonly kind: 'ready'; readonly next: StartableStep }
  | {
      readonly kind: 'active';
      readonly step: StepDescription;
      readonly attempt: {
        readonly number: number;
        readonly startedAt: string;
        readonly actor: WorkflowActor;
        /** The owner's attempt started by taking over the step's previous agent attempt (Take over, F17). */
        readonly takenOverFrom?: { readonly attempt: number };
        /** The agent's attempt started by the owner handing their attempt to it (Hand to agent). */
        readonly handedOverFrom?: { readonly attempt: number };
      };
      /**
       * What finishes the step, read for everyone whoever runs the attempt: each result with where
       * it goes and the exit gates it needs, evaluated now. Who may finish is `actions.finish`.
       */
      readonly exits: readonly StepExit[];
    }
  | {
      readonly kind: 'waiting';
      readonly step: StepDescription;
      /** The Tasks the wait needs closed: open ones and broken ones, in id order. */
      readonly blockingTasks: { readonly count: number; readonly ids: readonly string[] };
      /** Every Task of the Specification, broken ones included ("5 of 6"). */
      readonly totalTasks: number;
      /** The wait cannot complete without the owner. */
      readonly attention?: {
        readonly reason: Extract<AttentionReason, 'tasks-stuck' | 'task-escalated'>;
        readonly taskIds?: readonly string[];
        /** For `tasks-stuck`: why each Task of `taskIds` blocks. */
        readonly blocking?: readonly BlockingTask[];
      };
    }
  /**
   * An agent's result waits for the owner's Confirm or Reject (D17): the attempt ended (who did it,
   * when), the agent's proposal, and what Confirm applies besides taking the transition.
   */
  | {
      readonly kind: 'awaiting-confirmation';
      readonly step: StepDescription;
      readonly attempt: {
        readonly number: number;
        readonly startedAt: string;
        readonly endedAt?: string;
        readonly actor: WorkflowActor;
      };
      readonly proposal: {
        /** The result the agent chose: where it goes and the exit gates it needs, evaluated now. */
        readonly transition: StepExit;
        readonly feedback?: string;
        readonly artifacts: readonly string[];
      };
      readonly confirms: {
        /** `approve-draft-tasks`: the drafts it approves, as they are now, in id order. */
        readonly approvesDrafts?: readonly string[];
        /** The agent's Task status decisions, applied on Confirm. */
        readonly taskDecisions?: PendingOwnerDecisions['taskDecisions'];
      };
      /**
       * The digest of `confirms` with the content revisions of each draft's manifest and documents: Confirm names it, and is
       * refused (`WORKFLOW_CONFIRMATION_CHANGED`) when what it would apply changed since.
       */
      readonly confirmsDigest: string;
    }
  /** The subject has not started or is ready, but its next step cannot start. */
  | {
      readonly kind: 'blocked';
      readonly blockers: readonly StartBlocker[];
      /** First start: what it would pin, when the live definitions resolve. */
      readonly preview?: PinPreview;
      /** The step a start would activate once unblocked, when known. */
      readonly next?: StartableStep;
    }
  | {
      readonly kind: 'terminal';
      readonly outcome: TerminalOutcome;
      /** An abandoned run: who ended it, when and why. */
      readonly abandonment?: {
        readonly at: string;
        readonly reason: string;
        readonly actor: WorkflowActor;
      };
    };

/**
 * The hand-off as the owner reads it: the core hand-off plus, for a finished attempt, the title of
 * its step, who finished it and when.
 */
export type PresentedHandoff =
  | (Extract<Handoff, { kind: 'transition' }> & {
      /** The display label of the transition taken, when the definition gives one. */
      readonly label?: string;
      readonly from: {
        readonly step: string;
        readonly attempt: number;
        readonly title: string;
        readonly at?: string;
        readonly actor?: WorkflowActor;
      };
    })
  | Extract<Handoff, { kind: 'return' }>;

/** The workflow actions the owner may take now; an absent action is not allowed. */
/** A result of the active step with the exit gates it needs (absent when it needs none). */
export type StepExit = TransitionDescription & { readonly gates?: readonly GateStatus[] };

export interface WorkflowActions {
  readonly start?: {
    readonly step: string;
    /** The start creates the run (a Task confirms the pin preview first). */
    readonly firstStart: boolean;
    /** First Task start: send it with the start (`StartTaskInput.expectedWorkflowRevision`). */
    readonly expectedWorkflowRevision?: string;
    /**
     * With Git on, an agent attempt of the Specification waits for its own commit (D15): every
     * workflow write of the Specification is refused `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` until it
     * ran (`ActionProjection.attemptCommit` names the attempt). The same on `finish`, `return`,
     * `confirm` and `reject`.
     */
    readonly unavailable?: AttemptCommitWait;
  };
  /** The active attempt is the owner's: finish it with one of these results. */
  readonly finish?: {
    readonly step: string;
    readonly attempt: number;
    readonly transitions: readonly (TransitionDescription & {
      /**
       * Taking it now is refused: an escalating Task transition writes the Task's `task.yaml`
       * while one of its documents has a pending change (`WORKFLOW_TASK_BUSY`), a Specification
       * transition to `terminal completed` while Tasks are open (`tasks-open`, `WORKFLOW_TASKS_OPEN`),
       * or one of its exit gates does not hold (`WORKFLOW_GATE_UNSATISFIED`).
       */
      readonly unavailable?: 'task-document-change' | 'tasks-open' | 'gate-unsatisfied';
      /** For `tasks-open`: every open Task and why it is open, in id order. */
      readonly openTasks?: readonly OpenTask[];
      /**
       * For `tasks-open`: the finish's own input can close every open Task (it judges the state
       * after its Task list, `taskDecisions` and effects, `finishClosingOpenTasks`), so it may
       * still be accepted. Absent when a Task stays open whatever the finish sends (an active
       * attempt, a broken Task): the transition is plainly unavailable then.
       */
      readonly resolvableByFinish?: true;
      /** With `resolvableByFinish`: how the finish closes each open Task, in id order. */
      readonly closableTasks?: readonly ClosableTask[];
      /**
       * For `tasks-open`: the open Tasks, in id order, with a pending document change (D03). A
       * finish cannot close them (it would write their folder: `WORKFLOW_TASK_BUSY`), so a
       * transition that needs them closed is not `resolvableByFinish` until the change is saved.
       */
      readonly documentChangePending?: readonly string[];
      /** The exit gates that apply to it (`when`), with their status now; absent when none do. */
      readonly gates?: readonly GateStatus[];
    })[];
    /**
     * A step that produces Tasks: the drafts it owns (produced by this step in any attempt, D06) as
     * unchanged proposals. A finish lists those to keep; an owned draft it leaves out is cancelled.
     */
    readonly drafts?: readonly TaskProposal[];
    /** As `start.unavailable`. */
    readonly unavailable?: AttemptCommitWait;
  };
  /**
   * An agent's result waits for the owner (`awaiting-confirmation`): Confirm applies it, Reject
   * returns to its step with the owner's feedback. Both name the attempt.
   */
  readonly confirm?: {
    readonly step: string;
    readonly attempt: number;
    /**
     * With Git on, the attempt's own commit (D15) still waits: not run yet, or failed (`code`;
     * retry the commit first). Confirm is refused `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` meanwhile.
     */
    readonly unavailable?: AttemptCommitWait;
  };
  /** As `confirm`: Reject is refused `WORKFLOW_ATTEMPT_COMMIT_REQUIRED` while the commit waits. */
  readonly reject?: {
    readonly step: string;
    readonly attempt: number;
    readonly unavailable?: AttemptCommitWait;
  };
  /**
   * Hand to agent: the active attempt is the owner's and the step's executors include an agent. It
   * ends the owner's attempt and starts the agent's next attempt of the step (agent step execution,
   * `expected.handOver`). `agent` is the agent that would run, or why none can, as for a start; the
   * projection never reads the checkout (`baseline: unchecked`), so the owner's uncommitted work
   * (`owner-work-uncommitted`) is known from the explicit check and the hand itself.
   */
  readonly handToAgent?: {
    readonly step: string;
    readonly attempt: number;
    readonly agent: AgentOption;
  };
  /** Declared returns to steps the run reached. */
  readonly return?: {
    readonly targets: readonly {
      readonly step: string;
      /** The title of the step returned to. */
      readonly title: string;
      readonly label?: string;
      /** Whether the return needs a reason (its feedback). */
      readonly feedback: 'required' | 'optional';
    }[];
    /** As `start.unavailable`. */
    readonly unavailable?: AttemptCommitWait;
  };
}

/** Close and Abandon of a Specification (T6, D07), with the blockers that refuse them. */
export type SpecificationExitActions = SpecificationLifecycleActions;

/** The port T6 provides: Close/Abandon availability from the snapshot the projection read. */
export interface SpecificationExitPort {
  exitActions(snapshot: ExecutionSnapshot): Promise<SpecificationExitActions>;
}

/**
 * A task type a Task of the Specification may have now (the effective policy, D04), as the owner
 * chooses it when creating a Task: its texts and the workflow it runs with its work steps in
 * declared order (display only; the workflow may loop or branch).
 */
export interface TaskTypeOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly useWhen: string;
  readonly workflow: {
    readonly id: string;
    readonly title: string;
    readonly steps: readonly { readonly id: string; readonly title: string }[];
  };
}

export interface SpecificationLevelActions {
  /** `specification-ended`: the Specification's workflow completed or was abandoned. */
  readonly createTask: Availability<'task-limit' | 'specification-ended' | 'attempt-commit'>;
  /**
   * The task types a new Task may have, in catalogue order; empty when none is allowed or defined.
   * A type whose workflow is not a defined Task workflow is left out (its creation is refused).
   */
  readonly taskTypes: readonly TaskTypeOption[];
  /** Absent when no Close/Abandon port is given (`openWorkflow` wires it). */
  readonly exit?: SpecificationExitActions;
}

/** The agent holding the whole project, working on another subject (`ActionProjection.projectHold`). */
export interface ProjectHold {
  readonly kind: 'agent-working' | 'agent-outcome-unknown';
  readonly subject: { readonly specId: string; readonly taskId?: string; readonly title: string };
  readonly sessionId: string;
}

export interface ActionProjection {
  readonly subject: WorkflowSubject;
  /** The pinned workflow, or the one a first start would pin; absent when neither resolves. */
  readonly workflow?: WorkflowSummary;
  readonly position: ActionPosition;
  /** What the last finished attempt or return handed over. */
  readonly handoff?: PresentedHandoff;
  readonly actions: WorkflowActions;
  /** For a Task subject. */
  readonly task?: TaskLifecycleActions;
  /** For a Specification subject. */
  readonly specification?: SpecificationLevelActions;
  /**
   * For a Specification subject whose workflow resolves: where the run stands among the declared
   * steps, the next step and the step that produces Tasks (display facts).
   */
  readonly outline?: WorkflowOutline;
  /**
   * The documents the gates of the active and the next step name, one relation each
   * (`documentRelationsOf`). On the Specification projection and on one Task's own projection
   * (`inspectActions`) whenever the subject's workflow resolves and is unchanged; empty once the run
   * ended. A read of several Tasks never computes it.
   */
  readonly documentRelations?: readonly DocumentRelation[];
  /** The agent attempt of the active step; only the Runtime adds it (agent step execution). */
  readonly agentAttempt?: AgentAttemptView;
  /**
   * With Git on, the finished agent attempt of the Specification (of the subject or of another
   * subject of it) whose own commit (D15) still waits: every action that writes is `unavailable`
   * until it ran (`withAttemptCommitWait`); Retry commit names its `subject` and `step#attempt`.
   */
  readonly attemptCommit?: SpecificationAttemptCommitWait;
  /**
   * An agent working on another subject holds the project (its Turn runs, or SpecFlow cannot tell
   * whether its process still runs); only the Runtime adds it.
   */
  readonly projectHold?: ProjectHold;
  /**
   * For a Task subject that is not broken, in the projection of that one Task (`inspectActions`):
   * its effective context and dependency candidates. A read of several Tasks (`readExecution`,
   * `inspectExecution`) never computes it.
   */
  readonly taskAuthoring?: TaskAuthoringFacts;
  /**
   * What a person has to do about the subject now, if anything: the item `deriveAttention` derives
   * for it (a held Task's included, `heldTaskAttention`), or for a Task that has not started, its
   * start blockers that need a person (`startBlockerAttention`).
   */
  readonly attention?: AttentionItem;
}

export type ActionDependencies = Pick<
  WorkflowDependencies,
  'store' | 'serialize' | 'catalogue' | 'references'
> & {
  readonly specificationExit?: SpecificationExitPort;
  /** Whether an agent attempt of the Specification waits for its commit; absent: none waits. */
  readonly holds?: Pick<ExecutionHolds, 'attemptCommit'>;
};

/**
 * The projection while an agent attempt of the Specification waits for its own commit (D15, Git
 * on): every workflow write of the Specification is refused `WORKFLOW_ATTEMPT_COMMIT_REQUIRED`
 * (`attempt-commit-admission.ts`), so each action that writes says so before the click: `start`,
 * `finish`, `return`, `confirm` and `reject` carry `unavailable` (the wait's reason and code), the
 * next step's agent option is unavailable with that reason, the Task actions and New task are
 * unavailable (`attempt-commit`), and `attemptCommit` names the attempt (Retry commit).
 */
export function withAttemptCommitWait<P extends ActionProjection>(
  projection: P,
  wait: SpecificationAttemptCommitWait | undefined,
): P {
  if (wait === undefined) {
    return projection;
  }

  const waiting: AttemptCommitWait = {
    reason: wait.reason,
    ...(wait.code !== undefined ? { code: wait.code } : {}),
  };
  const { actions, position } = projection;
  const held = <T extends object>(action: T): T => ({ ...action, unavailable: waiting });
  // An available agent waits for the commit too: a start and a hand to the agent are refused.
  const heldOption = (agent: AgentOption): AgentOption =>
    agent.kind === 'available'
      ? {
          kind: 'unavailable',
          reason: waiting.reason,
          ...(waiting.code !== undefined ? { detail: waiting.code } : {}),
          launch: agent.launch,
          ...(agent.independent ? { independent: true as const } : {}),
        }
      : agent;
  const heldActions: WorkflowActions = {
    ...(actions.start ? { start: held(actions.start) } : {}),
    ...(actions.finish ? { finish: held(actions.finish) } : {}),
    ...(actions.confirm ? { confirm: held(actions.confirm) } : {}),
    ...(actions.reject ? { reject: held(actions.reject) } : {}),
    ...(actions.return ? { return: held(actions.return) } : {}),
    ...(actions.handToAgent
      ? { handToAgent: { ...actions.handToAgent, agent: heldOption(actions.handToAgent.agent) } }
      : {}),
  };
  const heldAgent = (next: StartableStep): StartableStep => ({
    ...next,
    agent: heldOption(next.agent),
  });
  const heldPosition: ActionPosition =
    position.kind === 'not-started' || position.kind === 'ready'
      ? { ...position, next: heldAgent(position.next) }
      : position.kind === 'blocked' && position.next
        ? { ...position, next: heldAgent(position.next) }
        : position;
  const blocked = unavailable('attempt-commit' as const);
  const task = projection.task;
  const heldTask: TaskLifecycleActions | undefined = task && {
    ...task,
    approve: task.approve.kind === 'allowed' ? blocked : task.approve,
    hold: task.hold.kind === 'allowed' ? blocked : task.hold,
    resume: task.resume.kind === 'allowed' ? blocked : task.resume,
    cancel: task.cancel.kind === 'allowed' ? blocked : task.cancel,
    remove: task.remove.kind === 'allowed' ? blocked : task.remove,
    editDetails: task.editDetails.kind === 'allowed' ? blocked : task.editDetails,
    editContext: task.editContext.kind === 'allowed' ? blocked : task.editContext,
    editDependencies: task.editDependencies.kind === 'allowed' ? blocked : task.editDependencies,
  };
  const specification = projection.specification;

  return {
    ...projection,
    position: heldPosition,
    actions: heldActions,
    ...(heldTask ? { task: heldTask } : {}),
    ...(specification
      ? {
          specification: {
            ...specification,
            createTask:
              specification.createTask.kind === 'allowed' ? blocked : specification.createTask,
          },
        }
      : {}),
    attemptCommit: wait,
  };
}

/**
 * The action projection of a subject. Strictly read-only: it reads one snapshot inside `serialize`,
 * so it never sees a mutation half-applied, and writes nothing. An unknown Task fails with
 * `WORKFLOW_SUBJECT_NOT_FOUND`; a Specification position that does not follow from its history
 * fails with `WORKFLOW_STATE_CORRUPT`, as in `inspectExecution`.
 */
export function inspectActions(
  outer: ActionDependencies,
  subject: WorkflowSubject,
): Promise<ActionProjection> {
  return outer.serialize(async () => {
    // One read: every reference lookup is asked once (`readScopedReferences`).
    const dependencies = forOneRead(outer);
    const snapshot = await dependencies.store.read(subject.specId);
    const derived = deriveAttention(dependencies.catalogue, snapshot);

    const wait = await outer.holds?.attemptCommit?.(subject.specId);
    if (subject.kind === 'specification') {
      return withAttemptCommitWait(
        await specificationProjection(dependencies, snapshot, subject, derived),
        wait,
      );
    }

    // The Task detail: the projection every read makes, plus the authoring facts of this Task.
    const read = taskProjectionRead(dependencies, snapshot, { detail: true });
    const projection = await taskProjection(dependencies, snapshot, subject, derived, read);
    const task = read.tasks.tasks.find((candidate) => candidate.taskId === subject.taskId);
    if (!task) {
      return withAttemptCommitWait(projection, wait);
    }

    return withAttemptCommitWait(
      {
        ...projection,
        taskAuthoring: await taskAuthoringOf(
          dependencies,
          snapshot,
          read.tasks,
          task,
          projection.task?.editDependencies.kind === 'allowed',
        ),
      },
      wait,
    );
  });
}

function summaryOf(definition: WorkflowDefinition): WorkflowSummary {
  // The pin a first start gives its run (a value; nothing is stored).
  const pin = newRun(definition).workflow;

  return {
    workflowId: pin.id,
    version: pin.version,
    revision: pin.revision,
    title: definition.title,
  };
}

function previewOf(definition: WorkflowDefinition): PinPreview {
  return {
    ...summaryOf(definition),
    firstStep: definition.entryStep,
    firstStepTitle: stepOf(definition, definition.entryStep).title,
    steps: definition.steps.map((step) => ({
      id: step.id,
      title: step.title,
      next: step.transitions.map((transition) =>
        transition.target.kind === 'step' ? transition.target.step : 'end',
      ),
    })),
  };
}

/** The drafts a producing step owns (D06), as the proposals that keep them unchanged. */
function ownedDrafts(tasks: ExecutionTasks, stepId: string): TaskProposal[] {
  return tasks.tasks
    .filter((task) => ownsDraft({ step: stepId }, task))
    .map((task) => ({
      id: task.taskId,
      title: task.title,
      ...(task.summary !== undefined ? { summary: task.summary } : {}),
      type: task.type,
      ...(task.dependsOn.length > 0 ? { dependsOn: task.dependsOn } : {}),
    }));
}

function presentHandoff(
  definition: WorkflowDefinition,
  run: WorkflowRun,
  handoff: Handoff | undefined,
): PresentedHandoff | undefined {
  if (handoff?.kind !== 'transition') {
    return handoff;
  }

  const record = run.attempts.find(
    (attempt) => attempt.step === handoff.from.step && attempt.attempt === handoff.from.attempt,
  );
  const by = record?.finishedBy ?? record?.actor;
  const step = findStep(definition, handoff.from.step);
  const label =
    step?.kind === 'work'
      ? step.transitions.find((transition) => transition.id === handoff.transition)?.label
      : undefined;

  return {
    ...handoff,
    ...(label !== undefined ? { label } : {}),
    from: {
      ...handoff.from,
      title: step?.title ?? handoff.from.step,
      ...(record?.endedAt ? { at: record.endedAt } : {}),
      ...(by ? { actor: by } : {}),
    },
  };
}

function stepOf(definition: WorkflowDefinition, id: string): WorkflowStep {
  const step = findStep(definition, id);
  if (!step) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The run refers to an unknown step "${id}".`);
  }

  return step;
}

const LAUNCH_BLOCKERS: ReadonlySet<string> = new Set<AgentUnavailableReason>(
  AGENT_UNAVAILABLE_REASONS,
);

/** The agent option of the next step, from the same decision a continuation makes (D10). */
function agentOptionOf(
  decision: ContinuationDecision,
  catalogue: Pick<ExecutionCatalogue, 'archetype'>,
): AgentOption {
  const available = (launch: AgentLaunch): AgentOption => ({
    kind: 'available',
    launch,
    ...(catalogue.archetype(launch.archetype)?.independent === true
      ? { independent: true as const }
      : {}),
  });
  if (decision.kind === 'continue') {
    return available(decision.launch);
  }

  if (decision.kind === 'attention') {
    if (decision.reason === 'human-step') {
      return { kind: 'unavailable', reason: 'not-an-executor' };
    }

    if (decision.suggestion) {
      return available(decision.suggestion);
    }

    const reason = decision.blocker ?? decision.reason;
    if (LAUNCH_BLOCKERS.has(reason)) {
      return { kind: 'unavailable', reason: reason as AgentUnavailableReason };
    }
  }

  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The next step of the run is not a work step.');
}

function startable(
  step: WorkflowStep,
  decision: ContinuationDecision,
  catalogue: Pick<ExecutionCatalogue, 'archetype'>,
): StartableStep {
  return {
    step: describeStep(step),
    human: step.kind === 'work' && step.executors.includes('human'),
    agent: agentOptionOf(decision, catalogue),
  };
}

/** Where the gates of a subject's steps are evaluated (read-only). */
interface GateReading {
  readonly subject: WorkflowSubject;
  readonly documents: GateDocuments;
}

/** The startable step with the status of its entry gates, when it declares any. */
async function withEntryGates(
  gates: GateReading,
  step: WorkflowStep,
  next: StartableStep,
): Promise<StartableStep> {
  const declared = step.kind === 'work' ? entryGatesOf(step) : [];
  if (declared.length === 0) {
    return next;
  }

  return { ...next, entryGates: await evaluateGates(gates.documents, gates.subject, declared) };
}

/** The unsatisfied entry gates of the next step, as a start blocker. */
function entryGateBlockers(next: StartableStep): StartBlocker[] {
  const unsatisfied = (next.entryGates ?? []).filter((gate) => gate.status === 'unsatisfied');

  return unsatisfied.length > 0 ? [{ kind: 'gates-unsatisfied', gates: unsatisfied }] : [];
}

/**
 * The steps whose gates relate to documents at `position` (`documentRelationsOf`): before a start
 * the step a start would activate (it starts now); at a step, that step and the one every transition
 * of it leads to (it starts later).
 */
export function relationStepsOf(
  definition: WorkflowDefinition,
  position: ActionPosition,
): RelationSteps {
  switch (position.kind) {
    case 'not-started':
    case 'ready':
      return { next: { step: stepOf(definition, position.next.step.id), startsNow: true } };
    case 'blocked':
      return position.next
        ? { next: { step: stepOf(definition, position.next.step.id), startsNow: true } }
        : {};
    // The confirmation of a held result judges the step's exit gates again.
    case 'active':
    case 'awaiting-confirmation':
    case 'waiting': {
      const step = stepOf(definition, position.step.id);
      const target = onlyTarget(step);

      return {
        ...(position.kind !== 'waiting' ? { active: step } : {}),
        ...(target !== undefined
          ? { next: { step: stepOf(definition, target), startsNow: false } }
          : {}),
      };
    }

    case 'terminal':
      return {};
  }
}

/** The projection with the relations of the documents its gates name. */
async function withDocumentRelations<P extends Pick<ActionProjection, 'position'>>(
  gates: GateReading,
  definition: WorkflowDefinition,
  projection: P,
): Promise<P & Pick<ActionProjection, 'documentRelations'>> {
  return {
    ...projection,
    documentRelations: await documentRelationsOf(
      gates.documents,
      gates.subject,
      relationStepsOf(definition, projection.position),
    ),
  };
}

/** The entry step of a run that does not exist yet: an agent would start it in a fresh Session. */
function firstStepOf(
  definition: WorkflowDefinition,
  catalogue: ExecutionCatalogue,
  gates: GateReading,
): Promise<StartableStep> {
  const entry = stepOf(definition, definition.entryStep);

  return withEntryGates(
    gates,
    entry,
    startable(
      entry,
      resolveContinuation({ next: entry, archetypes: (id) => catalogue.archetype(id) }),
      catalogue,
    ),
  );
}

/** A first start: `not-started` with its preview, or `blocked` with the preview. */
async function firstStart(
  definition: WorkflowDefinition,
  catalogue: ExecutionCatalogue,
  gates: GateReading,
  checks: readonly StartBlocker[],
  expectedRevision: boolean,
): Promise<Pick<ActionProjection, 'workflow' | 'position' | 'actions'>> {
  const preview = previewOf(definition);
  const next = await firstStepOf(definition, catalogue, gates);
  const blockers = [...checks, ...entryGateBlockers(next)];

  return {
    workflow: summaryOf(definition),
    position:
      blockers.length > 0
        ? { kind: 'blocked', blockers, preview, next }
        : { kind: 'not-started', preview, next },
    actions:
      blockers.length === 0 && next.human
        ? {
            start: {
              step: next.step.id,
              firstStart: true,
              ...(expectedRevision ? { expectedWorkflowRevision: preview.revision } : {}),
            },
          }
        : {},
  };
}

interface RunInput {
  readonly definition: WorkflowDefinition;
  readonly run: WorkflowRun;
  readonly catalogue: ExecutionCatalogue;
  /** Why the next step cannot start, asked only when the run is ready. */
  readonly startBlockers: () => Promise<readonly StartBlocker[]>;
  /** The owner may return the run: always a Specification, a Task only while its status is `ready`. */
  readonly returnable: boolean;
  /** A Task with a pending document change (D03): a finish that writes its folder is refused. */
  readonly documentChangePending: boolean;
  /** Whether a change of one of a Task's documents is pending (D03). */
  readonly taskDocumentChangePending: (specId: string, taskId: string) => Promise<boolean>;
  readonly tasks: ExecutionTasks;
  /** The snapshot read: the content revisions of what a Confirm applies (`confirmsDigest`). */
  readonly snapshot: ExecutionSnapshot;
  /** The document files of a draft a Confirm approves (`confirmsDigest`). */
  readonly references: Pick<TaskReferences, 'taskDocumentRevisions'>;
  readonly gates: GateReading;
}

/**
 * The results of an active work step, each with the exit gates that apply to it (a gate `when`
 * names its results). Every gate is read once, whichever results it applies to.
 */
async function stepExits(
  input: RunInput,
  step: Extract<WorkflowStep, { kind: 'work' }>,
): Promise<StepExit[]> {
  const statuses = new Map(
    (
      await evaluateGates(
        input.gates.documents,
        input.gates.subject,
        step.annotations.exitGates ?? [],
      )
    ).map((status) => [status.id, status] as const),
  );

  return describeTransitions(input.definition, step).map((transition) => {
    const gates = exitGatesFor(step, transition.result).flatMap(
      (gate) => statuses.get(gate.id) ?? [],
    );

    return { ...transition, ...(gates.length > 0 ? { gates } : {}) };
  });
}

/**
 * The finish transitions of an active work step: its results (`stepExits`) with whether each can
 * be taken now.
 */
async function finishTransitions(
  input: RunInput,
  step: Extract<WorkflowStep, { kind: 'work' }>,
  exits: readonly StepExit[],
): Promise<NonNullable<WorkflowActions['finish']>['transitions']> {
  // The open Tasks whose document change is pending (D03): a finish cannot close them, since that
  // writes their folder. Asked once, only when a transition waits for open Tasks.
  const anyOpen = describeTransitions(input.definition, step).some(
    (transition) =>
      tasksOpenAtCompletion(
        input.gates.subject,
        transition.target,
        input.tasks.tasks,
        input.tasks.broken,
      ).length > 0,
  );
  const busy = new Set<string>();
  if (anyOpen) {
    for (const task of input.tasks.tasks) {
      if (
        !isTaskClosed(task) &&
        (await input.taskDocumentChangePending(input.gates.subject.specId, task.taskId))
      ) {
        busy.add(task.taskId);
      }
    }
  }

  return exits.map((transition, index) => {
    const declared = step.transitions[index];
    const gates = transition.gates ?? [];
    // The finish asks the same rule (`advance`) on the state after its own input, so a finish
    // whose own Task list, decisions or effects can close every open Task may still complete.
    const open = tasksOpenAtCompletion(
      input.gates.subject,
      transition.target,
      input.tasks.tasks,
      input.tasks.broken,
    );
    const closable =
      open.length > 0
        ? finishClosingOpenTasks({
            subject: input.gates.subject,
            target: transition.target,
            tasks: input.tasks.tasks,
            broken: input.tasks.broken,
            ...(step.annotations.produces === 'tasks' ? { producingStep: step.id } : {}),
            decisions: input.gates.subject.kind === 'specification',
            effects: declared?.annotations.effects ?? [],
            documentChangePending: busy,
          })
        : undefined;
    const pendingOpen = open.filter((task) => busy.has(task.taskId)).map((task) => task.taskId);
    const unavailable =
      input.documentChangePending && declared?.annotations.escalate
        ? ('task-document-change' as const)
        : open.length > 0
          ? ('tasks-open' as const)
          : gates.some((gate) => gate.status === 'unsatisfied')
            ? ('gate-unsatisfied' as const)
            : undefined;

    return {
      ...transition,
      ...(unavailable ? { unavailable } : {}),
      ...(open.length > 0 ? { openTasks: open } : {}),
      ...(closable ? { resolvableByFinish: true as const, closableTasks: closable } : {}),
      ...(pendingOpen.length > 0 ? { documentChangePending: pendingOpen } : {}),
    };
  });
}

/** The position and the workflow actions of a run whose pinned definition is loaded. */
async function runProjection(
  input: RunInput,
): Promise<Pick<ActionProjection, 'workflow' | 'position' | 'actions' | 'handoff'>> {
  const { definition, run } = input;
  const handoff = presentHandoff(definition, run, handoffOf(run));
  const common = { workflow: summaryOf(definition), ...(handoff ? { handoff } : {}) };
  const position = run.position;
  if (position.state === 'terminal') {
    const abandonment = run.abandonment;

    return {
      ...common,
      position: {
        kind: 'terminal',
        outcome: position.outcome,
        ...(abandonment
          ? {
              abandonment: {
                at: abandonment.at,
                reason: abandonment.reason,
                actor: abandonment.actor,
              },
            }
          : {}),
      },
      actions: {},
    };
  }

  const returns = input.returnable ? returnTargets(definition, run) : [];
  const returnAction = returns.length > 0 ? { return: { targets: returns } } : {};
  if (position.state === 'not-started') {
    // Every start creates and activates a run in one change, so a stored run never rests here.
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A stored run has not started.');
  }

  if (position.state === 'ready') {
    const ready = stepOf(definition, position.step);
    const next = await withEntryGates(
      input.gates,
      ready,
      startable(ready, continuationOf(run, definition, input.catalogue), input.catalogue),
    );
    const blockers = [...(await input.startBlockers()), ...entryGateBlockers(next)];

    return {
      ...common,
      position: blockers.length > 0 ? { kind: 'blocked', blockers, next } : { kind: 'ready', next },
      actions: {
        ...(blockers.length === 0 && next.human
          ? { start: { step: next.step.id, firstStart: false } }
          : {}),
        ...returnAction,
      },
    };
  }

  if (position.state === 'awaiting-confirmation') {
    return { ...common, ...(await awaitingProjection(input)) };
  }

  const step = stepOf(definition, position.step);
  if (step.kind === 'wait') {
    const { tasks, broken } = input.tasks;
    const ids = [
      ...tasks.filter((task) => !isTaskClosed(task)).map((task) => task.taskId),
      ...broken,
    ].sort();
    const decision = waitDecision(step.id, tasks, broken);

    return {
      ...common,
      position: {
        kind: 'waiting',
        step: describeStep(step),
        blockingTasks: { count: ids.length, ids },
        totalTasks: tasks.length + broken.length,
        ...(decision.kind === 'attention' &&
        (decision.reason === 'tasks-stuck' || decision.reason === 'task-escalated')
          ? {
              attention: {
                reason: decision.reason,
                ...(decision.taskIds ? { taskIds: decision.taskIds } : {}),
                ...(decision.blocking ? { blocking: decision.blocking } : {}),
              },
            }
          : {}),
      },
      actions: returnAction,
    };
  }

  const attempt = activeAttempt(run);
  if (!attempt?.actor) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The active work attempt has no actor.');
  }

  const exits = await stepExits(input, step);
  // The attempt this one followed, when it was taken over (Take over, or Hand to agent).
  const previous = run.attempts.find(
    (record) => record.step === attempt.step && record.attempt === attempt.attempt - 1,
  );

  return {
    ...common,
    position: {
      kind: 'active',
      step: describeStep(step),
      attempt: {
        number: attempt.attempt,
        startedAt: attempt.startedAt,
        actor: attempt.actor,
        ...(previous?.outcome?.kind === 'taken-over'
          ? attempt.actor.class === 'human'
            ? { takenOverFrom: { attempt: previous.attempt } }
            : { handedOverFrom: { attempt: previous.attempt } }
          : {}),
      },
      exits,
    },
    actions: {
      // Hand to agent: only from the owner's attempt of a step an agent may do.
      ...(attempt.actor.class === 'human' && step.executors.includes('agent')
        ? {
            handToAgent: {
              step: step.id,
              attempt: attempt.attempt,
              agent: agentOptionOf(
                resolveContinuation({
                  next: step,
                  archetypes: (id) => input.catalogue.archetype(id),
                }),
                input.catalogue,
              ),
            },
          }
        : {}),
      // A person never finishes an agent's attempt (the core refuses it).
      ...(attempt.actor.class === 'human'
        ? {
            finish: {
              step: step.id,
              attempt: attempt.attempt,
              transitions: await finishTransitions(input, step, exits),
              ...(describeStep(step).produces === 'tasks'
                ? { drafts: ownedDrafts(input.tasks, step.id) }
                : {}),
            },
          }
        : {}),
      ...returnAction,
    },
  };
}

/**
 * A run waiting for the owner's confirmation of an agent's result (D17): the attempt that ended, the
 * agent's proposal (its result with where it goes and the exit gates it needs now, its feedback and
 * artifacts) and what Confirm applies besides moving on: the drafts `approve-draft-tasks` approves
 * (the Specification's drafts as they are now) and the agent's Task decisions. The owner's actions
 * are Confirm and Reject; nothing else moves the run (no start, finish or return).
 */
async function awaitingProjection(
  input: RunInput,
): Promise<Pick<ActionProjection, 'position' | 'actions'>> {
  const { definition, run } = input;
  const record = awaitingAttempt(run);
  const outcome = record?.outcome;
  const step = record ? stepOf(definition, record.step) : undefined;
  if (!record?.actor || outcome?.kind !== 'transition' || step?.kind !== 'work') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The awaited attempt has no pending result.');
  }

  const transition = (await stepExits(input, step)).find(
    (candidate) => candidate.id === outcome.transition,
  );
  const declared = step.transitions.find((candidate) => candidate.id === outcome.transition);
  if (!transition || !declared) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The run refers to an unknown transition "${outcome.transition}" of the step "${step.id}".`,
    );
  }

  const confirms = await resultConfirmsOf(
    declared.annotations.effects,
    input.tasks.tasks,
    input.snapshot,
    record,
    input.references,
  );
  const ref = { step: record.step, attempt: record.attempt };

  return {
    position: {
      kind: 'awaiting-confirmation',
      step: describeStep(step),
      attempt: {
        number: record.attempt,
        startedAt: record.startedAt,
        ...(record.endedAt !== undefined ? { endedAt: record.endedAt } : {}),
        actor: record.actor,
      },
      proposal: {
        transition,
        ...(outcome.feedback !== undefined ? { feedback: outcome.feedback } : {}),
        artifacts: outcome.artifacts,
      },
      confirms: {
        ...(confirms.approvesDrafts !== undefined
          ? { approvesDrafts: confirms.approvesDrafts.map((draft) => draft.taskId) }
          : {}),
        ...(confirms.taskDecisions.length > 0 ? { taskDecisions: confirms.taskDecisions } : {}),
      },
      confirmsDigest: confirmsDigestOf(confirms),
    },
    // While an attempt commit waits, both are `unavailable` (`withAttemptCommitWait`).
    actions: { confirm: ref, reject: ref },
  };
}

/** The declared returns to steps the run reached, as `returnToStep` allows them. */
function returnTargets(definition: WorkflowDefinition, run: WorkflowRun) {
  return definition.returns
    .filter((entry) => run.attempts.some((record) => record.step === entry.step))
    .map((entry) => ({
      step: entry.step,
      title: stepOf(definition, entry.step).title,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      feedback: entry.feedback,
    }));
}

/** The task types the policy allows whose workflow is a defined Task workflow. */
function taskTypeOptions(catalogue: ExecutionCatalogue, allowedTypes: TaskTypes): TaskTypeOption[] {
  return catalogue.taskTypes().flatMap((type) => {
    const workflow = catalogue.workflow(type.workflow);
    if (!isTaskTypeAllowed(allowedTypes, type.id) || workflow?.annotations.subject !== 'task') {
      return [];
    }

    return [
      {
        id: type.id,
        title: type.title,
        description: type.description,
        useWhen: type.useWhen,
        workflow: {
          id: workflow.id,
          title: workflow.title,
          steps: workflow.steps
            .filter((step) => step.kind === 'work')
            .map((step) => ({ id: step.id, title: describeStep(step).title })),
        },
      },
    ];
  });
}

/** The item `deriveAttention` derived for the subject, as the projection carries it. */
function ownAttention(
  derived: readonly AttentionItem[],
  subject: WorkflowSubject,
): Pick<ActionProjection, 'attention'> {
  const own = derived.find((item) =>
    subject.kind === 'specification'
      ? item.subject.kind === 'specification'
      : item.subject.kind === 'task' && item.subject.taskId === subject.taskId,
  );

  return own ? { attention: own } : {};
}

async function specificationProjection(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  subject: Extract<WorkflowSubject, { kind: 'specification' }>,
  derived: readonly AttentionItem[],
): Promise<ActionProjection> {
  return {
    ...(await specificationPosition(dependencies, snapshot, subject)),
    ...ownAttention(derived, subject),
  };
}

async function specificationPosition(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  subject: Extract<WorkflowSubject, { kind: 'specification' }>,
): Promise<ActionProjection> {
  const { catalogue } = dependencies;
  const specification: SpecificationLevelActions = {
    createTask: createTaskAvailability(snapshot),
    taskTypes: taskTypeOptions(catalogue, await effectiveTaskTypesOf(dependencies, snapshot)),
    ...(dependencies.specificationExit
      ? { exit: await dependencies.specificationExit.exitActions(snapshot) }
      : {}),
  };
  const gates: GateReading = { subject, documents: dependencies.references };
  const record = snapshot.specification?.value;
  if (!record) {
    const resolved = resolveSpecificationExecution(
      catalogue,
      await dependencies.references.archetype(subject.specId),
    );
    if (resolved.kind === 'problem') {
      return {
        subject,
        position: {
          kind: 'blocked',
          blockers: [{ kind: 'not-configured', message: resolved.message }],
        },
        actions: {},
        specification,
      };
    }

    return {
      subject,
      ...(await withDocumentRelations(
        gates,
        resolved.workflow,
        await firstStart(resolved.workflow, catalogue, gates, [], false),
      )),
      specification,
      outline: outlineOf(resolved.workflow, { kind: 'not-started' }),
    };
  }

  const definition = pinnedDefinitionIfUnchanged(catalogue, record.run);
  if (!definition) {
    return { subject, ...definitionChanged(record.run), specification };
  }

  return {
    subject,
    ...(await withDocumentRelations(
      gates,
      definition,
      await runProjection({
        definition,
        run: record.run,
        catalogue,
        startBlockers: () => Promise.resolve([]),
        returnable: true,
        // A Specification finish writes Task folders only through its input (drafts, decisions,
        // effects): the Tasks it would close are asked one by one (`taskDocumentChangePending`).
        documentChangePending: false,
        taskDocumentChangePending: (specId, taskId) =>
          dependencies.references.pendingDocumentChange(specId, taskId),
        tasks: executionTasks(catalogue, snapshot),
        snapshot,
        references: dependencies.references,
        gates,
      }),
    )),
    specification,
    outline: outlineOf(definition, outlinePositionOf(record.run)),
  };
}

function outlinePositionOf(run: WorkflowRun): OutlinePosition {
  const position = run.position;

  return position.state === 'terminal'
    ? { kind: 'ended' }
    : position.state === 'not-started'
      ? { kind: 'not-started' }
      : { kind: 'at', step: position.step };
}

function definitionChanged(run: WorkflowRun): Pick<ActionProjection, 'position' | 'actions'> {
  return {
    position: { kind: 'blocked', blockers: [{ kind: 'definition-changed', pinned: run.workflow }] },
    actions: {},
  };
}

/**
 * What every Task projection of one snapshot reads alike, derived once per read: the Tasks
 * (`executionTasks` replays every run) and the effective task types (they may read the archetype).
 */
export interface TaskProjectionRead {
  readonly tasks: ExecutionTasks;
  readonly allowedTypes: () => Promise<TaskTypes>;
  /**
   * The read is one Task's detail: it may list that Task's folder (`remove` names unregistered
   * files). A read of many Tasks does no per-Task filesystem work.
   */
  readonly detail: boolean;
}

export function taskProjectionRead(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  options: { readonly detail?: boolean } = {},
): TaskProjectionRead {
  let allowedTypes: Promise<TaskTypes> | undefined;

  return {
    tasks: executionTasks(dependencies.catalogue, snapshot),
    allowedTypes: () => (allowedTypes ??= effectiveTaskTypesOf(dependencies, snapshot)),
    detail: options.detail === true,
  };
}

/**
 * The action projection of one Task of a snapshot already read (inside `serialize`), without its
 * authoring facts (`taskAuthoring`, which only `inspectActions` adds for one Task): its position,
 * start blockers, workflow actions, lifecycle actions and attention. A read of every Task asks this
 * for each, with one {@link TaskProjectionRead}, so no part of it walks the other Tasks' graph.
 */
export async function taskProjection(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  subject: Extract<WorkflowSubject, { kind: 'task' }>,
  derived: readonly AttentionItem[],
  read: TaskProjectionRead = taskProjectionRead(dependencies, snapshot),
): Promise<ActionProjection> {
  const { catalogue } = dependencies;
  const { tasks } = read;
  if (tasks.broken.includes(subject.taskId)) {
    const issue = snapshot.issues.find(
      (candidate): candidate is Extract<TaskResourceIssue, { kind: 'broken' | 'dangling' }> =>
        (candidate.kind === 'broken' || candidate.kind === 'dangling') &&
        candidate.taskId === subject.taskId,
    );
    const reason = unavailable<TaskActionUnavailableReason>('broken');

    return {
      subject,
      position: {
        kind: 'blocked',
        blockers: [{ kind: 'broken', reason: issue?.reason ?? 'position' }],
      },
      actions: {},
      task: {
        approve: reason,
        hold: reason,
        resume: reason,
        cancel: reason,
        remove: reason,
        editDetails: reason,
        editContext: reason,
        editDependencies: reason,
      },
      ...ownAttention(derived, subject),
    };
  }

  const loaded = loadTask(catalogue, snapshot, subject.taskId, tasks);
  const { task } = loaded;
  const { lifecycle, pending } = await taskLifecycleOf(dependencies, snapshot, loaded, read.detail);
  const readinessBlockers = () => taskReadinessBlockers(task, tasks.tasks);
  const contextBlockers = async (): Promise<StartBlocker[]> => {
    const issues = (await unresolvedContext(dependencies, subject.specId, task)).filter(
      (issue) => issue.entry.required,
    );
    const stale = issues.filter((issue) => !isAwaited(issue));
    const awaited = issues.flatMap((issue) =>
      isAwaited(issue) && issue.entry.kind !== 'instructions'
        ? [{ index: issue.index, kind: issue.entry.kind }]
        : [],
    );

    return [
      ...(stale.length > 0
        ? [
            {
              kind: 'context-unresolved' as const,
              entries: stale.map((issue) => ({
                index: issue.index,
                kind: issue.entry.kind,
                reason: issue.reason,
              })),
            },
          ]
        : []),
      ...(awaited.length > 0 ? [{ kind: 'context-awaited' as const, entries: awaited }] : []),
    ];
  };

  const gates: GateReading = { subject, documents: dependencies.references };
  const run = task.run;
  if (!run) {
    let workflow: WorkflowDefinition | undefined;
    const typeBlockers: StartBlocker[] = [];
    try {
      workflow = resolveTaskType({
        type: task.type,
        allowed: await read.allowedTypes(),
        taskType: (id) => catalogue.taskType(id),
        workflow: (id) => catalogue.workflow(id),
      }).workflow;
    } catch (error) {
      typeBlockers.push(typeBlockerOf(error));
    }

    const blockers = [...readinessBlockers(), ...typeBlockers, ...(await contextBlockers())];
    // A Task on hold has no start-blocker item: the item of its hold, if any, is derived
    // (`heldTaskAttention`), as for a Task with a run.
    if (!workflow) {
      const attention = startBlockerAttention(subject, blockers, undefined, tasks.broken);

      return {
        subject,
        position: { kind: 'blocked', blockers },
        actions: {},
        task: lifecycle,
        ...(attention ? { attention } : ownAttention(derived, subject)),
      };
    }

    const started = await firstStart(workflow, catalogue, gates, blockers, true);
    const first = read.detail ? await withDocumentRelations(gates, workflow, started) : started;
    const attention =
      first.position.kind === 'blocked'
        ? startBlockerAttention(subject, first.position.blockers, first.position.next, tasks.broken)
        : undefined;

    return {
      subject,
      ...first,
      task: lifecycle,
      ...(attention ? { attention } : ownAttention(derived, subject)),
    };
  }

  const definition = pinnedDefinitionIfUnchanged(catalogue, run);
  if (!definition) {
    return {
      subject,
      ...definitionChanged(run),
      task: lifecycle,
      ...ownAttention(derived, subject),
    };
  }

  const projection = await runProjection({
    definition,
    run,
    catalogue,
    startBlockers: async () => [...readinessBlockers(), ...(await contextBlockers())],
    returnable: task.status === 'ready',
    documentChangePending: pending,
    taskDocumentChangePending: (specId, taskId) =>
      dependencies.references.pendingDocumentChange(specId, taskId),
    tasks,
    snapshot,
    references: dependencies.references,
    gates,
  });

  return {
    subject,
    ...(read.detail ? await withDocumentRelations(gates, definition, projection) : projection),
    task: lifecycle,
    ...ownAttention(derived, subject),
  };
}

function typeBlockerOf(error: unknown): StartBlocker {
  if (error instanceof WorkflowError) {
    if (error.code === 'WORKFLOW_TASK_TYPE_NOT_ALLOWED') {
      return { kind: 'type-not-allowed', message: error.message };
    }

    if (error.code === 'WORKFLOW_DEFINITION_MISSING') {
      return { kind: 'definition-missing', message: error.message };
    }
  }

  throw error;
}

/** The readiness rule of a start (`taskReadiness`), as blockers. */
function taskReadinessBlockers(
  task: ExecutionTask,
  tasks: readonly ExecutionTask[],
): StartBlocker[] {
  const readiness = taskReadiness(task, tasks);
  if (readiness.kind === 'status') {
    return [{ kind: 'status', status: readiness.status }];
  }

  if (readiness.kind === 'dependencies') {
    return [
      {
        kind: 'dependencies',
        waitingFor: readiness.waitingFor,
        unsatisfiable: unsatisfiableDependencies(readiness.waitingFor, tasks),
      },
    ];
  }

  return [];
}
