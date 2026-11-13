import { Type, type Static } from 'typebox';

import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import {
  ExitBlockerSchema,
  GateStatusSchema,
  WorkflowActorSchema,
  WorkflowRunPositionSchema,
  WorkflowStepSchema,
  WorkflowSubjectSchema,
} from './projection';

/**
 * The owner commands on a workflow subject and their results. The actor is never part of a request:
 * the Runtime derives it from the authenticated caller.
 */

export const WorkflowSpecParamsSchema = Type.Object(
  { specId: SpecIdSchema },
  { additionalProperties: false },
);
export const WorkflowTaskParamsSchema = Type.Object(
  { specId: SpecIdSchema, taskId: TaskIdSchema },
  { additionalProperties: false },
);

const literals = <const T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>(Type.Union(values.map((value) => Type.Literal(value))));

const StepId = Type.String({ minLength: 1, maxLength: 200 });

/** Start (or resume) the next step of the owner. */
export const StartWorkflowRequestSchema = Type.Object(
  {
    /**
     * Task first start: the workflow revision the owner confirmed (`actions.start.expectedWorkflowRevision`
     * of the projection). When the live workflow is another revision the start is refused with
     * `WORKFLOW_DEFINITION_CHANGED`.
     */
    expectedWorkflowRevision: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);
export type StartWorkflowRequest = Static<typeof StartWorkflowRequestSchema>;

/** A draft Task a step that produces Tasks proposes (`TaskProposal` of the Engine). */
export const TaskProposalSchema = Type.Object(
  {
    id: TaskIdSchema,
    title: Type.String({ minLength: 1, maxLength: 200 }),
    summary: Type.Optional(Type.String({ maxLength: 2000 })),
    type: Type.String({ minLength: 1, maxLength: 200 }),
    dependsOn: Type.Optional(Type.Array(TaskIdSchema, { maxItems: 100 })),
  },
  { additionalProperties: false },
);
export type TaskProposal = Static<typeof TaskProposalSchema>;

/**
 * Finish the active attempt of the owner. Repeating the same request returns the recorded result
 * with `replayed: true`; another request for that attempt is `WORKFLOW_ATTEMPT_MISMATCH`.
 */
export const FinishWorkflowRequestSchema = Type.Object(
  {
    step: StepId,
    attempt: Type.Integer({ minimum: 1 }),
    /** The result that selects the transition (`actions.finish.transitions[].result`). */
    result: Type.Optional(Type.String({ maxLength: 200 })),
    feedback: Type.Optional(Type.String({ maxLength: 20_000 })),
    artifacts: Type.Optional(Type.Array(Type.String({ maxLength: 1000 }), { maxItems: 100 })),
    /**
     * Required by, and only allowed for, a step that produces Tasks (`produces: tasks` in the
     * projection): the complete list of the Specification's draft Tasks after the finish, possibly
     * empty. A listed draft is revised, an unlisted one cancelled. Status decisions are not part of a
     * finish: the Task lifecycle actions decide them.
     */
    tasks: Type.Optional(Type.Array(TaskProposalSchema, { maxItems: 100 })),
  },
  { additionalProperties: false },
);
export type FinishWorkflowRequest = Static<typeof FinishWorkflowRequestSchema>;

/** Send the run back to a declared step it already reached. */
export const ReturnWorkflowRequestSchema = Type.Object(
  {
    step: StepId,
    /** Why; carried to the step as its handoff feedback. Required by some returns. */
    reason: Type.Optional(Type.String({ maxLength: 20_000 })),
  },
  { additionalProperties: false },
);
export type ReturnWorkflowRequest = Static<typeof ReturnWorkflowRequestSchema>;

/** End a Specification without realizing it. Final. */
export const AbandonSpecificationRequestSchema = Type.Object(
  { reason: Type.String({ minLength: 1, maxLength: 2000 }) },
  { additionalProperties: false },
);
export type AbandonSpecificationRequest = Static<typeof AbandonSpecificationRequestSchema>;

const LaunchSchema = Type.Object({
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
const LAUNCH_BLOCKERS = [
  'archetype-missing',
  'provider-not-chosen',
  'model-missing',
  'session-unavailable',
] as const;

export const WorkflowContinuationSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('none'),
    reason: Type.Union([
      Type.Literal('terminal'),
      Type.Literal('waiting-for-tasks'),
      Type.Literal('on-hold'),
    ]),
  }),
  Type.Object({
    kind: Type.Literal('continue'),
    step: StepId,
    launch: LaunchSchema,
  }),
  Type.Object({
    kind: Type.Literal('attention'),
    step: StepId,
    reason: literals(ATTENTION_REASONS),
    taskIds: Type.Optional(Type.Array(TaskIdSchema)),
    archetype: Type.Optional(Type.String()),
    provider: Type.Optional(Type.String()),
    suggestion: Type.Optional(LaunchSchema),
    blocker: Type.Optional(literals(LAUNCH_BLOCKERS)),
  }),
]);

export const StartWorkflowResultSchema = Type.Object({
  kind: Type.Union([Type.Literal('started'), Type.Literal('resumed'), Type.Literal('terminal')]),
  subject: WorkflowSubjectSchema,
  /** The step and attempt now active; absent for `terminal`. */
  step: Type.Optional(WorkflowStepSchema),
  attempt: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type StartWorkflowResult = Static<typeof StartWorkflowResultSchema>;

/**
 * What the host did once the finish was recorded (`commit-execution-state`: commit the
 * Specification's execution state when auto-commit is off). A failed post action does not fail the
 * finish; its `message` is display-only.
 */
const PostActionName = Type.Literal('commit-execution-state');

export const PostActionResultSchema = Type.Union([
  Type.Object({
    action: PostActionName,
    status: Type.Literal('completed'),
    commit: Type.Optional(
      Type.Object({ sha: Type.Optional(Type.String()), paths: Type.Array(Type.String()) }),
    ),
  }),
  Type.Object({ action: PostActionName, status: Type.Literal('skipped'), reason: Type.String() }),
  Type.Object({
    action: PostActionName,
    status: Type.Literal('failed'),
    code: Type.String(),
    message: Type.String(),
  }),
]);
export type PostActionResult = Static<typeof PostActionResultSchema>;

export const FinishWorkflowResultSchema = Type.Object({
  subject: WorkflowSubjectSchema,
  transition: Type.String(),
  position: WorkflowRunPositionSchema,
  continuation: WorkflowContinuationSchema,
  createdTasks: Type.Array(TaskIdSchema),
  specification: Type.Optional(WorkflowContinuationSchema),
  /** The request repeated the last finish: nothing changed, the result is the recorded one. */
  replayed: Type.Optional(Type.Literal(true)),
  /** The post actions that ran after the finish; absent when none ran. */
  postActions: Type.Optional(Type.Array(PostActionResultSchema)),
});
export type FinishWorkflowResult = Static<typeof FinishWorkflowResultSchema>;

export const ReturnWorkflowResultSchema = Type.Object({
  subject: WorkflowSubjectSchema,
  position: WorkflowRunPositionSchema,
  continuation: WorkflowContinuationSchema,
});
export type ReturnWorkflowResult = Static<typeof ReturnWorkflowResultSchema>;

export const AbandonSpecificationResultSchema = Type.Object({
  specId: SpecIdSchema,
  abandonment: Type.Object({
    sequence: Type.Integer({ minimum: 1 }),
    at: Type.String(),
    reason: Type.String(),
    actor: WorkflowActorSchema,
    from: WorkflowRunPositionSchema,
  }),
  /** The Tasks this abandon cancelled and the Task runs it ended, in id order. */
  cancelledTasks: Type.Array(TaskIdSchema),
  abandonedTaskRuns: Type.Array(TaskIdSchema),
});
export type AbandonSpecificationResult = Static<typeof AbandonSpecificationResultSchema>;

/**
 * Stable refusal codes. They mirror the Engine's workflow error codes; the contract test of the
 * Runtime keeps the two lists equal. `WORKFLOW_UNAVAILABLE` is the Runtime's own (no Engine); the `CONTROL_LOCK_*` codes are the project lock's.
 */
export const WORKFLOW_ERROR_CODES = [
  'WORKFLOW_DEFINITION_CHANGED',
  'WORKFLOW_ATTEMPT_MISMATCH',
  'WORKFLOW_POSITION_INVALID',
  'WORKFLOW_INPUT_INVALID',
  'WORKFLOW_RETURN_NOT_ALLOWED',
  'WORKFLOW_EXECUTOR_NOT_ALLOWED',
  'WORKFLOW_STATE_CORRUPT',
  'WORKFLOW_NOT_CONFIGURED',
  'WORKFLOW_SUBJECT_NOT_FOUND',
  'WORKFLOW_SPECIFICATION_NOT_STARTED',
  'WORKFLOW_TASK_BLOCKED',
  'WORKFLOW_DEPENDENCY_UNSATISFIED',
  'WORKFLOW_STATE_CONFLICT',
  'WORKFLOW_TASK_EXISTS',
  'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
  'WORKFLOW_TASK_TYPE_IMMUTABLE',
  'WORKFLOW_DEFINITION_MISSING',
  'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
  'WORKFLOW_TASK_REVISION_CONFLICT',
  'WORKFLOW_TASK_NOT_REMOVABLE',
  'WORKFLOW_TASK_BUSY',
  'WORKFLOW_SPECIFICATION_ENDED',
  'WORKFLOW_SPECIFICATION_BUSY',
  'WORKFLOW_EXIT_BLOCKED',
  'WORKFLOW_GATE_UNSATISFIED',
  'WORKFLOW_UNAVAILABLE',
  /** The project control lock (as in Close): only `CONTROL_LOCK_BUSY` is worth a retry. */
  'CONTROL_LOCK_BUSY',
  'CONTROL_LOCK_CORRUPT',
  'CONTROL_LOCK_OWNERSHIP_LOST',
  'CONTROL_LOCK_INVALID_HOME',
] as const;
export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[number];

const codes = Type.Unsafe<WorkflowErrorCode>(
  Type.Union(WORKFLOW_ERROR_CODES.map((code) => Type.Literal(code))),
);

/**
 * A refused workflow command. `code` is the stable value clients branch on (`error` repeats it);
 * `message` is display-only text and may change. `details.blockers` lists what holds a Specification
 * (`WORKFLOW_EXIT_BLOCKED`).
 */
export const WorkflowErrorSchema = Type.Object(
  {
    error: codes,
    code: codes,
    message: Type.String({ description: 'Display-only; do not parse.' }),
    details: Type.Optional(
      Type.Object({
        blockers: Type.Optional(Type.Array(ExitBlockerSchema)),
        /**
         * `WORKFLOW_TASK_CONTEXT_UNRESOLVED`: each context entry that does not resolve, by its
         * position (from 0), its key (`<kind>:<id>` or `path:<path>`) and why.
         */
        unresolved: Type.Optional(
          Type.Array(
            Type.Object({
              index: Type.Integer({ minimum: 0 }),
              key: Type.String(),
              reason: Type.Union([Type.Literal('not-registered'), Type.Literal('not-found')]),
            }),
          ),
        ),
        /**
         * `WORKFLOW_TASK_CONTEXT_UNRESOLVED`: the required process artifacts (`artifact: true`) that
         * do not exist yet, apart from the stale references.
         */
        /**
         * `WORKFLOW_INPUT_INVALID` of a Task create or edit: context entries that can never hold.
         * `required-own-artifact`: a required artifact of the Task's own documents; what a Task
         * produces is an exit gate on the producing step and an entry gate on the consuming step.
         */
        invalidContext: Type.Optional(
          Type.Array(
            Type.Object({
              index: Type.Integer({ minimum: 0 }),
              key: Type.String(),
              reason: Type.Literal('required-own-artifact'),
            }),
          ),
        ),
        /**
         * `WORKFLOW_INPUT_INVALID` of a producing finish: kept drafts that depend on drafts the
         * same finish cancels (left out of `tasks`). Keep both, or cancel both.
         */
        draftConflicts: Type.Optional(
          Type.Array(Type.Object({ kept: Type.String(), dependsOnCancelled: Type.String() })),
        ),
        awaited: Type.Optional(
          Type.Array(Type.Object({ index: Type.Integer({ minimum: 0 }), key: Type.String() })),
        ),
        /**
         * `WORKFLOW_GATE_UNSATISFIED`: whether the step's entry gates refused a start or its exit
         * gates a finish, the step, and every unsatisfied gate.
         */
        gate: Type.Optional(
          Type.Object({
            phase: Type.Union([Type.Literal('entry'), Type.Literal('exit')]),
            step: Type.String(),
            stepTitle: Type.String(),
            gates: Type.Array(GateStatusSchema),
          }),
        ),
      }),
    ),
  },
  { $id: 'WorkflowError', additionalProperties: false },
);
export type WorkflowError = Static<typeof WorkflowErrorSchema>;
