import { Type, type Static, type TSchema } from 'typebox';

import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import { TASK_CONTEXT_KINDS, type TaskStatus } from '../documents';

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
      }),
    ),
  }),
  Type.Object({
    kind: Type.Literal('blocked'),
    blockers: array(StartBlockerSchema),
    preview: Type.Optional(PinPreviewSchema),
    next: Type.Optional(StartableStepSchema),
  }),
  Type.Object({ kind: Type.Literal('terminal'), outcome: TerminalOutcomeSchema }),
]);

export const HandoffSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('transition'),
    from: Type.Object({ step: StepIdSchema, attempt: Type.Integer({ minimum: 1 }) }),
    transition: Type.String(),
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
    }),
  ),
  return: Type.Optional(
    Type.Object({
      targets: array(
        Type.Object({
          step: StepIdSchema,
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

export const WorkflowActionProjectionSchema = Type.Object(
  {
    subject: WorkflowSubjectSchema,
    workflow: Type.Optional(WorkflowSummarySchema),
    position: WorkflowPositionSchema,
    handoff: Type.Optional(HandoffSchema),
    actions: WorkflowActionsSchema,
    /** For a Task subject. */
    task: Type.Optional(TaskLifecycleActionsSchema),
    /** For a Specification subject. */
    specification: Type.Optional(
      Type.Object({
        createTask: availability(Type.Literal('task-limit')),
        exit: Type.Optional(SpecificationExitSchema),
      }),
    ),
  },
  { $id: 'WorkflowActionProjection' },
);
export type WorkflowActionProjection = Static<typeof WorkflowActionProjectionSchema>;
