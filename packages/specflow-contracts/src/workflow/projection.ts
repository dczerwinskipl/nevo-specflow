import { Type, type Static, type TSchema } from 'typebox';

import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import { TASK_CONTEXT_KINDS, TaskContextEntrySchema, type TaskStatus } from '../documents';

/**
 * The workflow action projection (`GET .../workflow/actions`): where a Specification or a Task
 * stands in its workflow and what the owner may do now. Clients render exactly what it allows; an
 * action that is absent or `unavailable` is not offered. Every `reason`, `kind` and code is a stable
 * machine value; the only free text is a `message`, which is for display and must not be parsed.
 */

const text = (maxLength = 20_000) => Type.String({ maxLength });
const literals = <const T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>(Type.Union(values.map((value) => Type.Literal(value))));
const array = <T extends TSchema>(item: T) => Type.Array(item, { maxItems: 1000 });

const StepIdSchema = Type.String({ minLength: 1, maxLength: 200 });

export const WorkflowActorSchema = Type.Union([
  Type.Object({
    class: Type.Literal('human'),
    details: Type.Object({
      actorId: Type.String(),
      trust: Type.Union([Type.Literal('local'), Type.Literal('authenticated')]),
    }),
  }),
  Type.Object({
    class: Type.Literal('agent'),
    details: Type.Object({
      archetype: Type.Optional(Type.String()),
      provider: Type.String(),
      model: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
    }),
  }),
]);
export type WorkflowActor = Static<typeof WorkflowActorSchema>;

export const WorkflowSubjectSchema = Type.Union([
  Type.Object({ kind: Type.Literal('specification'), specId: SpecIdSchema }),
  Type.Object({ kind: Type.Literal('task'), specId: SpecIdSchema, taskId: TaskIdSchema }),
]);
export type WorkflowSubject = Static<typeof WorkflowSubjectSchema>;

export const TERMINAL_OUTCOMES = ['completed', 'abandoned'] as const;
const TerminalOutcomeSchema = literals(TERMINAL_OUTCOMES);

export const WorkflowRunPositionSchema = Type.Union([
  Type.Object({ state: Type.Literal('not-started') }),
  Type.Object({
    state: Type.Literal('active'),
    step: StepIdSchema,
    attempt: Type.Integer({ minimum: 1 }),
  }),
  Type.Object({ state: Type.Literal('ready'), step: StepIdSchema }),
  Type.Object({ state: Type.Literal('terminal'), outcome: TerminalOutcomeSchema }),
]);
export type WorkflowRunPosition = Static<typeof WorkflowRunPositionSchema>;

const TransitionTargetSchema = Type.Union([
  Type.Object({ kind: Type.Literal('step'), step: StepIdSchema }),
  Type.Object({ kind: Type.Literal('terminal'), outcome: TerminalOutcomeSchema }),
]);

const ExecutorClassSchema = Type.Union([Type.Literal('agent'), Type.Literal('human')]);

/** A step as the owner sees it. `purpose` and `instructions` are display text. */
export const WorkflowStepSchema = Type.Object({
  id: StepIdSchema,
  title: Type.String(),
  kind: Type.Union([Type.Literal('work'), Type.Literal('wait')]),
  purpose: text(),
  instructions: Type.Optional(text()),
  executors: Type.Optional(array(ExecutorClassSchema)),
  interaction: Type.Optional(Type.Union([Type.Literal('interactive'), Type.Literal('autonomous')])),
  produces: Type.Optional(Type.Literal('tasks')),
});
export type WorkflowStep = Static<typeof WorkflowStepSchema>;

/** A result a work step may finish with. */
export const WorkflowTransitionSchema = Type.Object({
  id: Type.String(),
  result: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  target: TransitionTargetSchema,
  /** The title of the target step (a step target only). */
  targetTitle: Type.Optional(Type.String()),
  feedback: Type.Union([Type.Literal('required'), Type.Literal('optional')]),
});

const WorkflowPinSchema = Type.Object({
  id: Type.String(),
  version: Type.Integer(),
  revision: Type.String(),
});

const WorkflowSummaryFields = {
  workflowId: Type.String(),
  version: Type.Integer(),
  revision: Type.String(),
  title: Type.String(),
};
export const WorkflowSummarySchema = Type.Object(WorkflowSummaryFields);
export const PinPreviewSchema = Type.Object({
  ...WorkflowSummaryFields,
  firstStep: StepIdSchema,
  firstStepTitle: Type.String(),
  /**
   * The steps a start would pin, in declared order, with where their transitions lead (step ids;
   * `end` for a terminal target): a client that confirmed an earlier preview can name the change.
   */
  steps: array(Type.Object({ id: StepIdSchema, title: Type.String(), next: array(Type.String()) })),
});

export const AGENT_UNAVAILABLE_REASONS = [
  'not-an-executor',
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
  'session-unavailable',
] as const;
export const AgentOptionSchema = Type.Union([
  Type.Object({ kind: Type.Literal('available') }),
  Type.Object({
    kind: Type.Literal('unavailable'),
    reason: literals(AGENT_UNAVAILABLE_REASONS),
  }),
]);

export const GATE_UNSATISFIED_REASONS = [
  'no-document',
  'file-missing',
  'sections-missing',
  'unreadable',
] as const;

/** Where a gate looked: the Specification or one of its Tasks (link to its documents). */
export const GateScopeSchema = Type.Union([
  Type.Object({ kind: Type.Literal('specification'), specId: SpecIdSchema }),
  Type.Object({ kind: Type.Literal('task'), specId: SpecIdSchema, taskId: TaskIdSchema }),
]);

/**
 * A declared entry or exit gate of a step with its status now (a `document` gate: a registered
 * document of `documentType` with a file and the required section headings). `label` is display text.
 */
export const GateStatusSchema = Type.Object({
  id: Type.String(),
  type: Type.Literal('document'),
  label: Type.String(),
  documentType: Type.String(),
  scope: GateScopeSchema,
  status: Type.Union([Type.Literal('satisfied'), Type.Literal('unsatisfied')]),
  /** Satisfied: the document that satisfies it; `sections-missing`: the closest one. */
  documentId: Type.Optional(Type.String()),
  reason: Type.Optional(literals(GATE_UNSATISFIED_REASONS)),
  missingSections: Type.Optional(array(Type.String())),
});
export type GateStatus = Static<typeof GateStatusSchema>;

export const StartableStepSchema = Type.Object({
  step: WorkflowStepSchema,
  human: Type.Boolean(),
  agent: AgentOptionSchema,
  /** The step's entry gates; absent when it declares none. */
  entryGates: Type.Optional(array(GateStatusSchema)),
});

export const START_BLOCKER_KINDS = [
  'status',
  'dependencies',
  'broken',
  'definition-changed',
  'type-not-allowed',
  'definition-missing',
  'not-configured',
  'context-unresolved',
  'context-awaited',
  'gates-unsatisfied',
] as const;
export const BROKEN_REASONS = [
  'missing-folder',
  'missing-manifest',
  'unregistered-run',
  'draft-with-run',
  'cancelled-while-active',
  'position',
] as const;
export const CONTEXT_ISSUE_REASONS = ['not-registered', 'not-found'] as const;
/** The context entry kinds that can be a process artifact (every reference, not `instructions`). */
const ARTIFACT_CONTEXT_KINDS = TASK_CONTEXT_KINDS.filter(
  (kind): kind is Exclude<(typeof TASK_CONTEXT_KINDS)[number], 'instructions'> =>
    kind !== 'instructions',
);

/** Why the next step cannot start. `message` of the kinds that carry one is display-only. */
export const StartBlockerSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('status'),
    status: literals(['draft', 'on-hold', 'cancelled'] as const satisfies readonly Exclude<
      TaskStatus,
      'ready'
    >[]),
  }),
  Type.Object({
    kind: Type.Literal('dependencies'),
    waitingFor: array(TaskIdSchema),
    unsatisfiable: array(TaskIdSchema),
  }),
  Type.Object({ kind: Type.Literal('broken'), reason: literals(BROKEN_REASONS) }),
  Type.Object({ kind: Type.Literal('definition-changed'), pinned: WorkflowPinSchema }),
  Type.Object({ kind: Type.Literal('type-not-allowed'), message: text() }),
  Type.Object({ kind: Type.Literal('definition-missing'), message: text() }),
  Type.Object({ kind: Type.Literal('not-configured'), message: text() }),
  Type.Object({
    kind: Type.Literal('context-unresolved'),
    entries: array(
      Type.Object({
        index: Type.Integer({ minimum: 0 }),
        kind: literals(TASK_CONTEXT_KINDS),
        reason: literals(CONTEXT_ISSUE_REASONS),
      }),
    ),
  }),
  /** Required process artifacts (`artifact: true`) that do not exist yet: expected, not stale. */
  Type.Object({
    kind: Type.Literal('context-awaited'),
    entries: array(
      Type.Object({
        index: Type.Integer({ minimum: 0 }),
        kind: literals(ARTIFACT_CONTEXT_KINDS),
      }),
    ),
  }),
  /** The unsatisfied entry gates of the step a start would activate. */
  Type.Object({ kind: Type.Literal('gates-unsatisfied'), gates: array(GateStatusSchema) }),
]);

export const LaunchSchema = Type.Object({
  archetype: Type.String(),
  provider: Type.String(),
  model: Type.String(),
  effort: Type.Optional(Type.String()),
  session: Type.Union([
    Type.Object({ mode: Type.Literal('fresh') }),
    Type.Object({ mode: Type.Literal('reuse'), sessionId: Type.String() }),
  ]),
});

export const ATTENTION_REASONS = [
  'owner-action',
  'human-step',
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
  'session-unavailable',
  'tasks-stuck',
  'task-escalated',
] as const;
export const LAUNCH_BLOCKERS = [
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
  'session-unavailable',
] as const;

/** Why an open Task keeps a stuck Specification from finishing (`tasks-stuck`). */
export const BLOCKING_TASK_CAUSES = [
  'draft',
  'on-hold',
  'broken',
  'dependency-unsatisfiable',
] as const;
export const BlockingTaskSchema = Type.Object({
  taskId: TaskIdSchema,
  cause: literals(BLOCKING_TASK_CAUSES),
});

/**
 * Why a subject needs a person: the continuation reasons, then `task-broken`,
 * `definition-changed` and the start blockers of an approved Task that has not started that a
 * person fixes. Never inferred from a status name.
 */
export const ATTENTION_ITEM_REASONS = [
  ...ATTENTION_REASONS,
  'task-broken',
  'definition-changed',
  'context-unresolved',
  'dependency-unsatisfiable',
  'type-not-allowed',
  'definition-missing',
  'entry-gate-unsatisfied',
] as const;
/** The one action an item offers; a client maps it to its command or page. */
export const ATTENTION_ACTIONS = [
  'start-step',
  'configure-archetype',
  'review-tasks',
  'restore-task',
  'confirm-definition',
  'edit-context',
  'edit-dependencies',
  'remove-or-cancel',
  'satisfy-gate',
] as const;

/**
 * A subject a person has to act on, derived on every read and never stored: the reason (a stable
 * code), who has to act, the one action it offers and a display-only English `message`.
 */
export const WorkflowAttentionItemSchema = Type.Object({
  subject: WorkflowSubjectSchema,
  /** Absent when no step resolves (a broken Task, an unknown task type). */
  step: Type.Optional(StepIdSchema),
  stepTitle: Type.Optional(Type.String()),
  reason: literals(ATTENTION_ITEM_REASONS),
  actor: literals(['owner', 'agent'] as const),
  action: literals(ATTENTION_ACTIONS),
  message: text(4000),
  /** `task-escalated`, `tasks-stuck` (the Tasks to resolve), `dependency-unsatisfiable`. */
  taskIds: Type.Optional(array(TaskIdSchema)),
  /** `tasks-stuck`: why each Task of `taskIds` blocks. */
  blocking: Type.Optional(array(BlockingTaskSchema)),
  archetype: Type.Optional(Type.String()),
  provider: Type.Optional(Type.String()),
  blocker: Type.Optional(literals(LAUNCH_BLOCKERS)),
  suggestion: Type.Optional(LaunchSchema),
});
export type WorkflowAttentionItem = Static<typeof WorkflowAttentionItemSchema>;

export const WORKFLOW_ATTENTION_REASONS = ['tasks-stuck', 'task-escalated'] as const;

export const WorkflowPositionSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('not-started'),
    preview: PinPreviewSchema,
    next: StartableStepSchema,
  }),
  Type.Object({ kind: Type.Literal('ready'), next: StartableStepSchema }),
  Type.Object({
    kind: Type.Literal('active'),
    step: WorkflowStepSchema,
    attempt: Type.Object({
      number: Type.Integer({ minimum: 1 }),
      startedAt: Type.String(),
      actor: WorkflowActorSchema,
    }),
  }),
  Type.Object({
    kind: Type.Literal('waiting'),
    step: WorkflowStepSchema,
    blockingTasks: Type.Object({ count: Type.Integer({ minimum: 0 }), ids: array(TaskIdSchema) }),
    totalTasks: Type.Integer({ minimum: 0 }),
    attention: Type.Optional(
      Type.Object({
        reason: literals(WORKFLOW_ATTENTION_REASONS),
        taskIds: Type.Optional(array(TaskIdSchema)),
        /** `tasks-stuck`: why each Task of `taskIds` blocks (Now's explanation). */
        blocking: Type.Optional(array(BlockingTaskSchema)),
      }),
    ),
  }),
  Type.Object({
    kind: Type.Literal('blocked'),
    blockers: array(StartBlockerSchema),
    preview: Type.Optional(PinPreviewSchema),
    next: Type.Optional(StartableStepSchema),
  }),
  Type.Object({
    kind: Type.Literal('terminal'),
    outcome: TerminalOutcomeSchema,
    /** An abandoned run: who ended it, when and why (the reason is the owner's text). */
    abandonment: Type.Optional(
      Type.Object({ at: Type.String(), reason: text(2000), actor: WorkflowActorSchema }),
    ),
  }),
]);

export const HandoffSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('transition'),
    from: Type.Object({
      step: StepIdSchema,
      attempt: Type.Integer({ minimum: 1 }),
      /** The step's title (display text). */
      title: Type.String(),
      /** When the attempt ended and who finished it, where recorded. */
      at: Type.Optional(Type.String()),
      actor: Type.Optional(WorkflowActorSchema),
    }),
    transition: Type.String(),
    /** The display label of the transition taken, when the definition gives one. */
    label: Type.Optional(Type.String()),
    result: Type.Optional(Type.String()),
    feedback: Type.Optional(text()),
    artifacts: array(Type.String()),
  }),
  Type.Object({ kind: Type.Literal('return'), at: Type.String(), feedback: Type.Optional(text()) }),
]);

export const WorkflowActionsSchema = Type.Object({
  start: Type.Optional(
    Type.Object({
      step: StepIdSchema,
      firstStart: Type.Boolean(),
      /** First Task start: send it back with the start so a changed workflow is refused. */
      expectedWorkflowRevision: Type.Optional(Type.String()),
    }),
  ),
  finish: Type.Optional(
    Type.Object({
      step: StepIdSchema,
      attempt: Type.Integer({ minimum: 1 }),
      transitions: array(
        Type.Intersect([
          WorkflowTransitionSchema,
          Type.Object({
            unavailable: Type.Optional(
              Type.Union([Type.Literal('task-document-change'), Type.Literal('gate-unsatisfied')]),
            ),
            /** The exit gates that apply to the transition; absent when none do. */
            gates: Type.Optional(array(GateStatusSchema)),
          }),
        ]),
      ),
      /**
       * A step that produces Tasks: the drafts it owns (any earlier attempt of this step) as
       * unchanged proposals. A finish lists the ones to keep; an owned draft left out is cancelled.
       * Drafts created by hand or by another step are never affected.
       */
      drafts: Type.Optional(
        array(
          Type.Object({
            id: TaskIdSchema,
            title: Type.String(),
            summary: Type.Optional(Type.String()),
            type: Type.String(),
            dependsOn: Type.Optional(array(TaskIdSchema)),
          }),
        ),
      ),
    }),
  ),
  return: Type.Optional(
    Type.Object({
      targets: array(
        Type.Object({
          step: StepIdSchema,
          title: Type.String(),
          label: Type.Optional(Type.String()),
          feedback: Type.Union([Type.Literal('required'), Type.Literal('optional')]),
        }),
      ),
    }),
  ),
});

export const TASK_ACTION_UNAVAILABLE_REASONS = [
  'status',
  'ended',
  'cancelled',
  'active-attempt',
  'started',
  'has-dependents',
  'task-document-change',
  'unregistered-files',
  'broken',
] as const;

const availability = <Reason extends TSchema>(reason: Reason) =>
  Type.Union([
    Type.Object({ kind: Type.Literal('allowed') }),
    Type.Object({
      kind: Type.Literal('unavailable'),
      reason,
      /** `has-dependents`: the Tasks that depend on this one. */
      taskIds: Type.Optional(array(TaskIdSchema)),
      /** `unregistered-files`: the files of the Task folder it does not register. */
      files: Type.Optional(array(Type.String())),
    }),
  ]);

const TaskAvailabilitySchema = availability(literals(TASK_ACTION_UNAVAILABLE_REASONS));

export const TaskLifecycleActionsSchema = Type.Object({
  revision: Type.Optional(Type.String()),
  approve: TaskAvailabilitySchema,
  hold: TaskAvailabilitySchema,
  resume: TaskAvailabilitySchema,
  cancel: TaskAvailabilitySchema,
  remove: TaskAvailabilitySchema,
  editDetails: TaskAvailabilitySchema,
  editContext: TaskAvailabilitySchema,
  editDependencies: TaskAvailabilitySchema,
});

export const EXIT_BLOCKER_KINDS = [
  'specification-run',
  'draft-tasks',
  'on-hold-tasks',
  'unfinished-tasks',
  'broken-tasks',
  'pending-execution-change',
  'pending-task-documents',
  'operation-in-progress',
  'execution-state-unreadable',
] as const;

/** One group of what keeps a Specification from ending; `subjectIds` are Task ids or the Specification id. */
export const ExitBlockerSchema = Type.Object({
  kind: literals(EXIT_BLOCKER_KINDS),
  subjectIds: array(Type.String()),
  /** Display-only. */
  message: text(),
});
export type ExitBlocker = Static<typeof ExitBlockerSchema>;

export const SpecificationExitSchema = Type.Object({
  /** As far as the workflow is concerned; Close still checks Git and the workspace itself. */
  close: Type.Union([
    Type.Object({ kind: Type.Literal('allowed') }),
    Type.Object({ kind: Type.Literal('blocked'), blockers: array(ExitBlockerSchema) }),
  ]),
  abandon: Type.Union([
    Type.Object({ kind: Type.Literal('allowed') }),
    Type.Object({ kind: Type.Literal('blocked'), blockers: array(ExitBlockerSchema) }),
    Type.Object({
      kind: Type.Literal('unavailable'),
      reason: Type.Union([Type.Literal('ended'), Type.Literal('not-configured')]),
    }),
  ]),
});

/**
 * A task type the owner may choose for a new Task: its texts (display only) and the work steps of
 * the Task workflow it runs, in declared order (a workflow may loop or branch; this is no order).
 */
export const TaskTypeOptionSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: text(),
  useWhen: text(),
  workflow: Type.Object({
    id: Type.String(),
    title: Type.String(),
    steps: array(Type.Object({ id: StepIdSchema, title: Type.String() })),
  }),
});
export type TaskTypeOption = Static<typeof TaskTypeOptionSchema>;

export const DEPENDENCY_INELIGIBILITIES = [
  'dependency',
  'would-create-cycle',
  'cancelled',
  'broken',
] as const;

/**
 * What the owner edits on a Task, as the Engine reads it: the effective context (the explicit list,
 * or the Engine's default one) with each entry's state, and the other Tasks a dependency may name.
 */
export const TaskAuthoringSchema = Type.Object({
  context: Type.Object({
    /** No explicit list: the default context; an edit sends these entries as the explicit list. */
    isDefault: Type.Boolean(),
    entries: array(
      Type.Union([
        Type.Object({ entry: TaskContextEntrySchema, state: Type.Literal('resolved') }),
        Type.Object({
          entry: TaskContextEntrySchema,
          state: Type.Literal('unresolved'),
          reason: literals(CONTEXT_ISSUE_REASONS),
        }),
        /** A missing process artifact: expected, not stale. */
        Type.Object({ entry: TaskContextEntrySchema, state: Type.Literal('awaited') }),
      ]),
    ),
  }),
  /** The other Tasks in list order; empty once the dependencies cannot change. */
  dependencyCandidates: array(
    Type.Object({
      taskId: TaskIdSchema,
      /** Absent: it may be added. */
      unavailable: Type.Optional(literals(DEPENDENCY_INELIGIBILITIES)),
    }),
  ),
});
export type TaskAuthoring = Static<typeof TaskAuthoringSchema>;

export const WorkflowActionProjectionSchema = Type.Object(
  {
    subject: WorkflowSubjectSchema,
    workflow: Type.Optional(WorkflowSummarySchema),
    position: WorkflowPositionSchema,
    handoff: Type.Optional(HandoffSchema),
    actions: WorkflowActionsSchema,
    /** For a Task subject. */
    task: Type.Optional(TaskLifecycleActionsSchema),
    /** For a Task subject that is not broken. */
    taskAuthoring: Type.Optional(TaskAuthoringSchema),
    /** What a person has to do about the subject now, if anything. */
    attention: Type.Optional(WorkflowAttentionItemSchema),
    /** For a Specification subject. */
    specification: Type.Optional(
      Type.Object({
        createTask: availability(Type.Literal('task-limit')),
        /** The task types a new Task may have now (the effective policy), in catalogue order. */
        taskTypes: array(TaskTypeOptionSchema),
        exit: Type.Optional(SpecificationExitSchema),
      }),
    ),
  },
  { $id: 'WorkflowActionProjection' },
);
export type WorkflowActionProjection = Static<typeof WorkflowActionProjectionSchema>;
