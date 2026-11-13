import {
  activeAttempt,
  findStep,
  handoffOf,
  newRun,
  type Handoff,
  type TerminalOutcome,
  type WorkflowPin,
} from '@nevo/workflow';
import {
  resolveContinuation,
  type AttentionReason,
  type ContinuationDecision,
  type LaunchBlocker,
} from '../continuation/resolve';
import type { SpecificationLifecycleActions } from '../close/blockers';
import { resolveSpecificationExecution, type ExecutionCatalogue } from '../definitions/catalogue';
import type { TaskTypes, WorkflowDefinition, WorkflowStep } from '../definitions/model';
import { WorkflowError } from '../errors';
import { TASKS_PER_SPECIFICATION_MAX } from '../limits';
import type { TaskContextEntry } from '../../tasks/resource/model';
import {
  unregisteredTaskFiles,
  type TaskContextIssue,
  type TaskResourceIssue,
} from '../../tasks/resource/validate';
import {
  taskPosition,
  type ExecutionTask,
  type TaskStatus,
  type WorkflowActor,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import {
  isTaskClosed,
  isTaskTypeAllowed,
  resolveTaskType,
  taskDecisionRefusal,
  taskReadiness,
  unsatisfiableDependencies,
} from '../tasks/tasks';
import { continuationOf, waitDecision } from './advance';
import {
  executionTasks,
  loadTask,
  pinnedDefinitionIfUnchanged,
  type ExecutionTasks,
  type WorkflowDependencies,
} from './loaded-execution';
import {
  describeStep,
  describeTransitions,
  type StepDescription,
  type TransitionDescription,
} from './step-context';
import { effectiveTaskTypesOf, isAwaited, unresolvedContext } from './task-policy';
import { entryGatesOf, exitGatesFor, type GateStatus } from '../gates/evaluate';
import { evaluateGates, type GateDocuments } from '../gates/read';

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

/** An action the owner may take now, or why not. */
export type Availability<Reason extends string> =
  | { readonly kind: 'allowed' }
  | {
      readonly kind: 'unavailable';
      readonly reason: Reason;
      /** For `has-dependents`: the Tasks that depend on this one, in id order. */
      readonly taskIds?: readonly string[];
      /** For `unregistered-files`: the files of the Task folder it does not register. */
      readonly files?: readonly string[];
    };

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
export type AgentUnavailableReason = (typeof AGENT_UNAVAILABLE_REASONS)[number];

/** Whether an agent could do the step. Only reported in this feature, never dispatched. */
export type AgentOption =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: AgentUnavailableReason };

/** The step a start would activate, with who may do it. */
export interface StartableStep {
  readonly step: StepDescription;
  /** A person may do the step (the owner's start). */
  readonly human: boolean;
  readonly agent: AgentOption;
  /** The step's entry gates with their status now; absent when it declares none. */
  readonly entryGates?: readonly GateStatus[];
}

/** Why the next step of a subject cannot start. */
export type StartBlocker =
  | { readonly kind: 'status'; readonly status: Exclude<TaskStatus, 'ready'> }
  | {
      readonly kind: 'dependencies';
      /** Every dependency that has not completed, in declared order. */
      readonly waitingFor: readonly string[];
      /** Those that can no longer complete (ended otherwise, cancelled or broken). */
      readonly unsatisfiable: readonly string[];
    }
  /** The Task's files are inconsistent (`ExecutionInspection.brokenTasks`); restore them from Git. */
  | {
      readonly kind: 'broken';
      readonly reason:
        Extract<TaskResourceIssue, { kind: 'broken' | 'dangling' }>['reason'] | 'position';
    }
  /** The workflow the run is pinned to is missing or changed (`WORKFLOW_DEFINITION_CHANGED`). */
  | { readonly kind: 'definition-changed'; readonly pinned: WorkflowPin }
  /** First start: the task type is not allowed by the effective policy any more. */
  | { readonly kind: 'type-not-allowed'; readonly message: string }
  /** First start: the task type or its workflow is not defined. */
  | { readonly kind: 'definition-missing'; readonly message: string }
  /** First start of a Specification: its archetype has no usable execution binding. */
  | { readonly kind: 'not-configured'; readonly message: string }
  /** A required context entry does not resolve (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`). */
  | {
      readonly kind: 'context-unresolved';
      readonly entries: readonly {
        /** Position in the context list, from 0. */
        readonly index: number;
        readonly kind: TaskContextEntry['kind'];
        readonly reason: TaskContextIssue['reason'];
      }[];
    }
  /**
   * A required process artifact (`artifact: true`) does not exist yet: expected, not stale. The start
   * is refused like an unresolved entry (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`, `awaited`).
   */
  | {
      readonly kind: 'context-awaited';
      readonly entries: readonly {
        readonly index: number;
        readonly kind: Exclude<TaskContextEntry['kind'], 'instructions'>;
      }[];
    }
  /** An entry gate of the step does not hold (`WORKFLOW_GATE_UNSATISFIED`); the unsatisfied ones. */
  | { readonly kind: 'gates-unsatisfied'; readonly gates: readonly GateStatus[] };

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
      };
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
      };
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
  | { readonly kind: 'terminal'; readonly outcome: TerminalOutcome };

/** The workflow actions the owner may take now; an absent action is not allowed. */
export interface WorkflowActions {
  readonly start?: {
    readonly step: string;
    /** The start creates the run (a Task confirms the pin preview first). */
    readonly firstStart: boolean;
    /** First Task start: send it with the start (`StartTaskInput.expectedWorkflowRevision`). */
    readonly expectedWorkflowRevision?: string;
  };
  /** The active attempt is the owner's: finish it with one of these results. */
  readonly finish?: {
    readonly step: string;
    readonly attempt: number;
    readonly transitions: readonly (TransitionDescription & {
      /**
       * Taking it now is refused: an escalating Task transition writes the Task's `task.yaml`
       * while one of its documents has a pending change (`WORKFLOW_TASK_BUSY`), or one of its exit
       * gates does not hold (`WORKFLOW_GATE_UNSATISFIED`).
       */
      readonly unavailable?: 'task-document-change' | 'gate-unsatisfied';
      /** The exit gates that apply to it (`when`), with their status now; absent when none do. */
      readonly gates?: readonly GateStatus[];
    })[];
  };
  /** Declared returns to steps the run reached. */
  readonly return?: {
    readonly targets: readonly {
      readonly step: string;
      readonly label?: string;
      /** Whether the return needs a reason (its feedback). */
      readonly feedback: 'required' | 'optional';
    }[];
  };
}

export type TaskActionUnavailableReason =
  /** The Task's status does not allow it (for example approving a Task that is not a draft). */
  | 'status'
  /** The Task's run ended. */
  | 'ended'
  | 'cancelled'
  /** An attempt is active: finish or return the current step first. */
  | 'active-attempt'
  /** The Task has started: its dependencies are fixed; it is cancelled, not removed. */
  | 'started'
  | 'has-dependents'
  /**
   * A change of one of the Task's documents is pending (D03): the change would write its folder,
   * which the store refuses (`WORKFLOW_TASK_BUSY`, reason `task-document-change`).
   */
  | 'task-document-change'
  /** The Task folder holds files it does not register; move or register them first. */
  | 'unregistered-files'
  | 'broken';

/** The owner's Task lifecycle actions (`setTaskStatus`, `editTask`, `removeTask`). */
export interface TaskLifecycleActions {
  /** The manifest revision an edit or a removal names; absent for a broken Task. */
  readonly revision?: string;
  readonly approve: Availability<TaskActionUnavailableReason>;
  /** Shown disabled with its reason during an active attempt (UX contract). */
  readonly hold: Availability<TaskActionUnavailableReason>;
  readonly resume: Availability<TaskActionUnavailableReason>;
  readonly cancel: Availability<TaskActionUnavailableReason>;
  readonly remove: Availability<TaskActionUnavailableReason>;
  /** Title and summary. */
  readonly editDetails: Availability<TaskActionUnavailableReason>;
  readonly editContext: Availability<TaskActionUnavailableReason>;
  /** Only before the first start. */
  readonly editDependencies: Availability<TaskActionUnavailableReason>;
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
  readonly createTask: Availability<'task-limit'>;
  /**
   * The task types a new Task may have, in catalogue order; empty when none is allowed or defined.
   * A type whose workflow is not a defined Task workflow is left out (its creation is refused).
   */
  readonly taskTypes: readonly TaskTypeOption[];
  /** Absent when no Close/Abandon port is given (`openWorkflow` wires it). */
  readonly exit?: SpecificationExitActions;
}

export interface ActionProjection {
  readonly subject: WorkflowSubject;
  /** The pinned workflow, or the one a first start would pin; absent when neither resolves. */
  readonly workflow?: WorkflowSummary;
  readonly position: ActionPosition;
  /** What the last finished attempt or return handed over. */
  readonly handoff?: Handoff;
  readonly actions: WorkflowActions;
  /** For a Task subject. */
  readonly task?: TaskLifecycleActions;
  /** For a Specification subject. */
  readonly specification?: SpecificationLevelActions;
}

export type ActionDependencies = Pick<
  WorkflowDependencies,
  'store' | 'serialize' | 'catalogue' | 'references'
> & {
  readonly specificationExit?: SpecificationExitPort;
};

/**
 * The action projection of a subject. Strictly read-only: it reads one snapshot inside `serialize`,
 * so it never sees a mutation half-applied, and writes nothing. An unknown Task fails with
 * `WORKFLOW_SUBJECT_NOT_FOUND`; a Specification position that does not follow from its history
 * fails with `WORKFLOW_STATE_CORRUPT`, as in `inspectExecution`.
 */
export function inspectActions(
  dependencies: ActionDependencies,
  subject: WorkflowSubject,
): Promise<ActionProjection> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(subject.specId);

    return subject.kind === 'specification'
      ? specificationProjection(dependencies, snapshot, subject)
      : taskProjection(dependencies, snapshot, subject);
  });
}

const allowed = { kind: 'allowed' } as const;
const unavailable = <Reason extends string>(
  reason: Reason,
  details: { readonly taskIds?: readonly string[]; readonly files?: readonly string[] } = {},
): Availability<Reason> => ({ kind: 'unavailable', reason, ...details });

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
  return { ...summaryOf(definition), firstStep: definition.entryStep };
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
function agentOptionOf(decision: ContinuationDecision): AgentOption {
  if (decision.kind === 'continue') {
    return { kind: 'available' };
  }

  if (decision.kind === 'attention') {
    if (decision.reason === 'human-step') {
      return { kind: 'unavailable', reason: 'not-an-executor' };
    }

    if (decision.suggestion) {
      return { kind: 'available' };
    }

    const reason = decision.blocker ?? decision.reason;
    if (LAUNCH_BLOCKERS.has(reason)) {
      return { kind: 'unavailable', reason: reason as AgentUnavailableReason };
    }
  }

  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The next step of the run is not a work step.');
}

function startable(step: WorkflowStep, decision: ContinuationDecision): StartableStep {
  return {
    step: describeStep(step),
    human: step.kind === 'work' && step.executors.includes('human'),
    agent: agentOptionOf(decision),
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
  readonly tasks: ExecutionTasks;
  readonly gates: GateReading;
}

/**
 * The finish transitions of an active work step, each with the exit gates that apply to it. Every
 * gate is read once, whichever transitions it applies to.
 */
async function finishTransitions(
  input: RunInput,
  step: Extract<WorkflowStep, { kind: 'work' }>,
): Promise<NonNullable<WorkflowActions['finish']>['transitions']> {
  const statuses = new Map(
    (
      await evaluateGates(
        input.gates.documents,
        input.gates.subject,
        step.annotations.exitGates ?? [],
      )
    ).map((status) => [status.id, status] as const),
  );

  return describeTransitions(step).map((transition, index) => {
    const declared = step.transitions[index];
    const gates = exitGatesFor(step, transition.result).flatMap(
      (gate) => statuses.get(gate.id) ?? [],
    );
    const unavailable =
      input.documentChangePending && declared?.annotations.escalate
        ? ('task-document-change' as const)
        : gates.some((gate) => gate.status === 'unsatisfied')
          ? ('gate-unsatisfied' as const)
          : undefined;

    return {
      ...transition,
      ...(unavailable ? { unavailable } : {}),
      ...(gates.length > 0 ? { gates } : {}),
    };
  });
}

/** The position and the workflow actions of a run whose pinned definition is loaded. */
async function runProjection(
  input: RunInput,
): Promise<Pick<ActionProjection, 'workflow' | 'position' | 'actions' | 'handoff'>> {
  const { definition, run } = input;
  const handoff = handoffOf(run);
  const common = { workflow: summaryOf(definition), ...(handoff ? { handoff } : {}) };
  const position = run.position;
  if (position.state === 'terminal') {
    return { ...common, position: { kind: 'terminal', outcome: position.outcome }, actions: {} };
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
      startable(ready, continuationOf(run, definition, input.catalogue)),
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

  return {
    ...common,
    position: {
      kind: 'active',
      step: describeStep(step),
      attempt: { number: attempt.attempt, startedAt: attempt.startedAt, actor: attempt.actor },
    },
    actions: {
      // A person never finishes an agent's attempt (the core refuses it).
      ...(attempt.actor.class === 'human'
        ? {
            finish: {
              step: step.id,
              attempt: attempt.attempt,
              transitions: await finishTransitions(input, step),
            },
          }
        : {}),
      ...returnAction,
    },
  };
}

/** The declared returns to steps the run reached, as `returnToStep` allows them. */
function returnTargets(definition: WorkflowDefinition, run: WorkflowRun) {
  return definition.returns
    .filter((entry) => run.attempts.some((record) => record.step === entry.step))
    .map((entry) => ({
      step: entry.step,
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

async function specificationProjection(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  subject: Extract<WorkflowSubject, { kind: 'specification' }>,
): Promise<ActionProjection> {
  const { catalogue } = dependencies;
  const specification: SpecificationLevelActions = {
    createTask:
      (snapshot.index?.value.tasks.length ?? 0) >= TASKS_PER_SPECIFICATION_MAX
        ? unavailable('task-limit')
        : allowed,
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
      ...(await firstStart(resolved.workflow, catalogue, gates, [], false)),
      specification,
    };
  }

  const definition = pinnedDefinitionIfUnchanged(catalogue, record.run);
  if (!definition) {
    return { subject, ...definitionChanged(record.run), specification };
  }

  return {
    subject,
    ...(await runProjection({
      definition,
      run: record.run,
      catalogue,
      startBlockers: () => Promise.resolve([]),
      returnable: true,
      // A Specification finish writes Task folders only through its input (drafts, decisions,
      // effects); the store refuses such a finish then, which no projection can tell beforehand.
      documentChangePending: false,
      tasks: executionTasks(catalogue, snapshot),
      gates,
    })),
    specification,
  };
}

function definitionChanged(run: WorkflowRun): Pick<ActionProjection, 'position' | 'actions'> {
  return {
    position: { kind: 'blocked', blockers: [{ kind: 'definition-changed', pinned: run.workflow }] },
    actions: {},
  };
}

/** The action projection of one Task of a snapshot already read (inside `serialize`). */
export async function taskProjection(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
  subject: Extract<WorkflowSubject, { kind: 'task' }>,
): Promise<ActionProjection> {
  const { catalogue } = dependencies;
  const tasks = executionTasks(catalogue, snapshot);
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
    };
  }

  const { task, manifest } = loadTask(catalogue, snapshot, subject.taskId);
  const pending = await dependencies.references.pendingDocumentChange(
    subject.specId,
    subject.taskId,
  );
  // Only a Task that never started can be removed, so only its folder is listed.
  const unregistered = task.run
    ? []
    : unregisteredTaskFiles(
        manifest.value,
        await dependencies.store.taskFiles(subject.specId, subject.taskId),
      );
  const lifecycle = lifecycleOf(task, manifest.revision, snapshot, pending, unregistered);
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
        allowed: await effectiveTaskTypesOf(dependencies, snapshot),
        taskType: (id) => catalogue.taskType(id),
        workflow: (id) => catalogue.workflow(id),
      }).workflow;
    } catch (error) {
      typeBlockers.push(typeBlockerOf(error));
    }

    const blockers = [...readinessBlockers(), ...typeBlockers, ...(await contextBlockers())];
    if (!workflow) {
      return { subject, position: { kind: 'blocked', blockers }, actions: {}, task: lifecycle };
    }

    return {
      subject,
      ...(await firstStart(workflow, catalogue, gates, blockers, true)),
      task: lifecycle,
    };
  }

  const definition = pinnedDefinitionIfUnchanged(catalogue, run);
  if (!definition) {
    return { subject, ...definitionChanged(run), task: lifecycle };
  }

  return {
    subject,
    ...(await runProjection({
      definition,
      run,
      catalogue,
      startBlockers: async () => [...readinessBlockers(), ...(await contextBlockers())],
      returnable: task.status === 'ready',
      documentChangePending: pending,
      tasks,
      gates,
    })),
    task: lifecycle,
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

/**
 * The owner's lifecycle actions on a Task that is not broken: the status decisions ask
 * `taskDecisionRefusal` (no hold or cancel during an active attempt), the edits and the removal
 * follow `editTask` and `removeTask`.
 */
function lifecycleOf(
  task: ExecutionTask,
  revision: string,
  snapshot: ExecutionSnapshot,
  pending: boolean,
  unregistered: readonly string[],
): TaskLifecycleActions {
  type Action = Availability<TaskActionUnavailableReason>;
  const state = taskPosition(task).state;
  const decision = (from: TaskStatus | undefined, to: TaskStatus): Action => {
    const refusal = taskDecisionRefusal(task, to);
    if (refusal === 'ended') {
      return unavailable('ended');
    }

    if (to === 'cancelled' && task.status === 'cancelled') {
      return unavailable('cancelled');
    }

    if (refusal === 'status' || (from !== undefined && task.status !== from)) {
      return unavailable('status');
    }

    if (refusal === 'active-attempt') {
      return unavailable('active-attempt');
    }

    return pending ? unavailable('task-document-change') : allowed;
  };

  const edit: Action =
    task.status === 'cancelled'
      ? unavailable('cancelled')
      : state === 'terminal'
        ? unavailable('ended')
        : pending
          ? unavailable('task-document-change')
          : allowed;
  const dependents = snapshot.manifests
    .filter((entry) => entry.value.dependsOn.includes(task.taskId))
    .map((entry) => entry.value.id)
    .sort();

  return {
    revision,
    approve: decision('draft', 'ready'),
    hold: decision('ready', 'on-hold'),
    resume: decision('on-hold', 'ready'),
    cancel: decision(undefined, 'cancelled'),
    remove: task.run
      ? unavailable('started')
      : dependents.length > 0
        ? unavailable('has-dependents', { taskIds: dependents })
        : pending
          ? unavailable('task-document-change')
          : unregistered.length > 0
            ? unavailable('unregistered-files', { files: unregistered })
            : allowed,
    editDetails: edit,
    editContext: edit,
    editDependencies: edit.kind === 'allowed' && task.run ? unavailable('started') : edit,
  };
}
