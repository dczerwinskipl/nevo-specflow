import { Type, type Static } from 'typebox';

import {
  TASK_STATUS_REASON_MAX_LENGTH,
  TASKS_PER_SPECIFICATION_MAX,
} from '../documents/task-resource-files';
import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import {
  ATTENTION_REASONS,
  AgentOptionSchema,
  BlockingTaskSchema,
  ExitBlockerSchema,
  LAUNCH_BLOCKERS,
  LaunchSchema,
  GateStatusSchema,
  OpenTaskSchema,
  WorkflowActorSchema,
  WorkflowAttemptRefSchema,
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

/** The idempotency key of an owner request (a UUID): a repeat returns the same outcome. */
const RequestIdSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});

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

export const ReevaluateWaitRequestSchema = WorkflowAttemptRefSchema;
export type ReevaluateWaitRequest = Static<typeof ReevaluateWaitRequestSchema>;
export const ReevaluateWaitResultSchema = Type.Object({
  ...WorkflowAttemptRefSchema.properties,
  status: literals(['settled', 'already-settled'] as const),
});
export type ReevaluateWaitResult = Static<typeof ReevaluateWaitResultSchema>;

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
 * An explicit status decision of a Specification finish (`TaskDecision` of the Engine; the CLI's
 * `--task-decisions-file`), applied after `tasks` and before the transition's effects.
 */
export const TaskDecisionSchema = Type.Object(
  {
    taskId: TaskIdSchema,
    status: Type.Union([Type.Literal('ready'), Type.Literal('on-hold'), Type.Literal('cancelled')]),
    reason: Type.Optional(Type.String({ maxLength: TASK_STATUS_REASON_MAX_LENGTH })),
  },
  { additionalProperties: false },
);
export type TaskDecision = Static<typeof TaskDecisionSchema>;

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
     * empty. A listed draft is revised, an unlisted one cancelled.
     */
    tasks: Type.Optional(Type.Array(TaskProposalSchema, { maxItems: 100 })),
    /**
     * Only for a Specification step: status decisions on its Tasks, applied after `tasks` and
     * before the transition's effects; one decision that is not allowed rejects the whole finish. A
     * finish to `terminal completed` is judged after them, so it may cancel the open Tasks
     * (`resolvableByFinish` in the projection).
     */
    taskDecisions: Type.Optional(
      Type.Array(TaskDecisionSchema, { maxItems: TASKS_PER_SPECIFICATION_MAX }),
    ),
  },
  { additionalProperties: false },
);
export type FinishWorkflowRequest = Static<typeof FinishWorkflowRequestSchema>;

/** The changed files one agent finish proposal declares at most (the dirty set's bound). */
export const AGENT_CHANGED_PATHS_MAX = 500;
/** The longest checkout-relative path a finish proposal declares. */
export const AGENT_CHANGED_PATH_LENGTH_MAX = 1024;

/**
 * An agent's finish proposal for its own attempt (Ask agent, D12): the owner's finish input and the
 * files outside SpecFlow's own folders the attempt changed (`changes.paths`, B3). The declared set
 * must equal what is uncommitted outside the Specification directories and SpecFlow's namespace:
 * an undeclared changed file or a declared file that is not changed refuses the proposal
 * (`WORKFLOW_UNDECLARED_CHANGES`). Absent `changes` declares no file.
 */
export const AgentFinishProposalRequestSchema = Type.Object(
  {
    ...FinishWorkflowRequestSchema.properties,
    changes: Type.Optional(
      Type.Object(
        {
          /** Checkout-relative paths with `/` separators, as `git status` names them; each once. */
          paths: Type.Array(
            Type.String({ minLength: 1, maxLength: AGENT_CHANGED_PATH_LENGTH_MAX }),
            { maxItems: AGENT_CHANGED_PATHS_MAX },
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type AgentFinishProposalRequest = Static<typeof AgentFinishProposalRequestSchema>;

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

export const WorkflowContinuationSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('none'),
    reason: Type.Union([
      Type.Literal('terminal'),
      Type.Literal('waiting-for-tasks'),
      Type.Literal('on-hold'),
      /** An agent's result waits for the owner's Confirm or Reject (D17). */
      Type.Literal('awaiting-confirmation'),
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
    /** For `tasks-stuck`: each Task of `taskIds` with why it blocks. */
    blocking: Type.Optional(Type.Array(BlockingTaskSchema)),
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
 * Specification's execution state when auto-commit is off; `attempt-commit`: the one commit of an
 * agent attempt, D15, its documents, Tasks, execution state and declared files, whatever the commit
 * policy). A failed post action does not fail the finish; its `message` is display-only.
 */
const PostActionName = Type.Union([
  Type.Literal('commit-execution-state'),
  Type.Literal('attempt-commit'),
]);

export const PostActionResultSchema = Type.Union([
  Type.Object({
    action: PostActionName,
    status: Type.Literal('completed'),
    commit: Type.Optional(
      Type.Object({ sha: Type.Optional(Type.String()), paths: Type.Array(Type.String()) }),
    ),
    /**
     * Execution state left uncommitted because someone edited it since the Engine wrote it: `edited`
     * are those paths, `paths` everything that travels with them (an operation is never split).
     */
    held: Type.Optional(
      Type.Object({ edited: Type.Array(Type.String()), paths: Type.Array(Type.String()) }),
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

/**
 * The owner's **Retry commit** of a finished agent attempt whose commit failed (D15): the attempt
 * `step#attempt` of the subject, as the Now block and Close name it.
 */
export const RetryAttemptCommitRequestSchema = Type.Object(
  { step: StepId, attempt: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export type RetryAttemptCommitRequest = Static<typeof RetryAttemptCommitRequestSchema>;

/** What the retried attempt commit reported (`attempt-commit`: completed, skipped or failed). */
export const RetryAttemptCommitResultSchema = Type.Object({
  postActions: Type.Array(PostActionResultSchema),
});
export type RetryAttemptCommitResult = Static<typeof RetryAttemptCommitResultSchema>;

/**
 * The owner's **Confirm** of an agent's result that waits for them (D17, `actions.confirm`): the
 * attempt `step#attempt` the owner was shown. `requestId` is the idempotency key: the same request
 * again returns the recorded decision with `replayed: true`; a confirm or reject of an attempt
 * another request decided is `WORKFLOW_ATTEMPT_MISMATCH`.
 */
export const ConfirmWorkflowRequestSchema = Type.Object(
  { requestId: RequestIdSchema, step: StepId, attempt: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export type ConfirmWorkflowRequest = Static<typeof ConfirmWorkflowRequestSchema>;

/**
 * The owner's **Reject** of that result (`actions.reject`): the step goes back to ready to start
 * with `feedback` (required) as its handoff; nothing the agent wrote is undone or committed.
 */
export const RejectWorkflowRequestSchema = Type.Object(
  {
    ...ConfirmWorkflowRequestSchema.properties,
    feedback: Type.String({ minLength: 1, maxLength: 20_000 }),
  },
  { additionalProperties: false },
);
export type RejectWorkflowRequest = Static<typeof RejectWorkflowRequestSchema>;

/**
 * The confirmed result: the transition taken and what follows, as after a finish, and what the
 * attempt commit (D15), which runs once the step finished, reported (`postActions`; empty for a
 * replay whose commit already ran).
 */
export const ConfirmWorkflowResultSchema = Type.Object({
  subject: WorkflowSubjectSchema,
  transition: Type.String(),
  position: WorkflowRunPositionSchema,
  continuation: WorkflowContinuationSchema,
  specification: Type.Optional(WorkflowContinuationSchema),
  replayed: Type.Optional(Type.Literal(true)),
  postActions: Type.Array(PostActionResultSchema),
});
export type ConfirmWorkflowResult = Static<typeof ConfirmWorkflowResultSchema>;

export const RejectWorkflowResultSchema = Type.Object({
  subject: WorkflowSubjectSchema,
  position: WorkflowRunPositionSchema,
  continuation: WorkflowContinuationSchema,
  replayed: Type.Optional(Type.Literal(true)),
});
export type RejectWorkflowResult = Static<typeof RejectWorkflowResultSchema>;

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
  'WORKFLOW_TASKS_OPEN',
  'WORKFLOW_OWNER_DECISION_REQUIRED',
  /**
   * Ask agent attribution (B3, B6): the checkout has uncommitted changes SpecFlow cannot attribute
   * (`WORKFLOW_DIRTY_BASELINE`, at the start), files changed since the agent's last Turn ended
   * (`WORKFLOW_BASELINE_CHANGED`, at Continue), new files in a Specification directory without a
   * document type (`WORKFLOW_UNREGISTERED_DOCUMENTS`), SpecFlow's own files edited past it
   * (`WORKFLOW_ENGINE_FILE_EDITED`), or changed files the finish proposal does not declare exactly
   * (`WORKFLOW_UNDECLARED_CHANGES`), or an untracked Git repository inside the checkout
   * (`WORKFLOW_NESTED_REPOSITORY`); `details.attribution` names the paths.
   */
  'WORKFLOW_DIRTY_BASELINE',
  'WORKFLOW_BASELINE_CHANGED',
  'WORKFLOW_UNREGISTERED_DOCUMENTS',
  'WORKFLOW_ENGINE_FILE_EDITED',
  'WORKFLOW_UNDECLARED_CHANGES',
  'WORKFLOW_NESTED_REPOSITORY',
  /**
   * Ask agent cannot start or continue now; `details.agent` is the unavailable agent option with its
   * reason (the projection's `agent`, or `agentAttempt.continue`), so the form can explain it.
   */
  'WORKFLOW_AGENT_UNAVAILABLE',
  'WORKFLOW_UNAVAILABLE',
  /**
   * The Runtime's own: the commit policy of the workflow state refused the change before anything
   * was written (a protected branch, Git unavailable, too many uncommitted paths, a journal to
   * recover); `details.commit` names the refusal in the documents' vocabulary.
   */
  'WORKFLOW_COMMIT_REFUSED',
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
 * What holds a Specification whose workflow cannot change now (`WORKFLOW_SPECIFICATION_BUSY`):
 * `agent-turn` an agent Session Turn holds the project-wide write claim (retry once it ends, or stop
 * it); `agent-turn-unknown` that Turn ended without a verified outcome (resolve the Session: Check
 * outcome, or its recovery); `claim-not-held` a write of an agent execution whose claim is no
 * longer held (its Turn settled: start a new one); `close` a Close of the Specification is unsettled. The other values are
 * the busy causes of the commit admission of the workflow state, as in the documents' `SPEC_BUSY`;
 * `other` a busy refusal whose cause is not one of these (still a refusal: retry later).
 */
export const SPECIFICATION_BUSY_CAUSES = [
  'agent-turn',
  'agent-turn-unknown',
  'claim-not-held',
  'close',
  'create-or-close',
  'commit-in-progress',
  'queue-full',
  'held-limit',
  'recovery-required',
  'manifest-changed',
  'source-changed',
  'write-in-progress',
  'task-resource-change',
  'other',
] as const;
export type SpecificationBusyCause = (typeof SPECIFICATION_BUSY_CAUSES)[number];

/**
 * The document refusals of the workflow state's commit admission that a workflow command answers as
 * `WORKFLOW_COMMIT_REFUSED` (the same codes, reasons and causes as a document write's refusal).
 */
export const WORKFLOW_COMMIT_REFUSAL_CODES = [
  'BRANCH_PROTECTED',
  'COMMIT_BLOCKED',
  'GIT_POLICY_INVALID',
  'DOCUMENT_UNCOMMITTED_LIMIT',
  'DOCUMENT_OPERATION_INVALID',
  'DOCUMENT_RECOVERY_REQUIRED',
] as const;
export type WorkflowCommitRefusalCode = (typeof WORKFLOW_COMMIT_REFUSAL_CODES)[number];

/**
 * The paths of an Ask agent attribution refusal (`WORKFLOW_DIRTY_BASELINE`,
 * `WORKFLOW_BASELINE_CHANGED`, `WORKFLOW_UNREGISTERED_DOCUMENTS`, `WORKFLOW_ENGINE_FILE_EDITED`,
 * `WORKFLOW_UNDECLARED_CHANGES`): the first of them (`paths`, sorted) of `count`. For
 * `WORKFLOW_UNDECLARED_CHANGES`, `undeclared` are changed files the proposal does not declare and
 * `unchanged` declared files that are not changed files of the attempt (`paths` holds both).
 * `remedies` (`WORKFLOW_UNREGISTERED_DOCUMENTS`): give each file a document type, or delete a new
 * one, or restore a changed one.
 * `incomplete`: what is uncommitted cannot be read in full (more changed files than SpecFlow names,
 * an unreadable record of its own writes, no record of the last Turn), so nothing is attributed.
 */
export const WorkflowAttributionSchema = Type.Object({
  paths: Type.Array(Type.String()),
  count: Type.Integer({ minimum: 0 }),
  undeclared: Type.Optional(Type.Array(Type.String())),
  unchanged: Type.Optional(Type.Array(Type.String())),
  remedies: Type.Optional(
    Type.Array(
      Type.Union([Type.Literal('classify'), Type.Literal('delete'), Type.Literal('restore')]),
    ),
  ),
  incomplete: Type.Optional(Type.Literal(true)),
});
export type WorkflowAttribution = Static<typeof WorkflowAttributionSchema>;

/**
 * A refused workflow command. `code` is the stable value clients branch on (`error` repeats it);
 * `message` is display-only text and may change. `details.blockers` lists what holds a Specification
 * (`WORKFLOW_EXIT_BLOCKED`), `details.openTasks` the Tasks a completion waits for
 * (`WORKFLOW_TASKS_OPEN`), `details.cause` (and `sessionId`) what holds a busy Specification
 * (`WORKFLOW_SPECIFICATION_BUSY`).
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
        /**
         * `WORKFLOW_TASKS_OPEN`: a Specification transition to `terminal completed` refused while
         * Tasks are open; every open Task and why it is open, in id order.
         */
        openTasks: Type.Optional(Type.Array(OpenTaskSchema)),
        /** An Ask agent attribution refusal: the paths it names ({@link WorkflowAttributionSchema}). */
        attribution: Type.Optional(WorkflowAttributionSchema),
        /** `WORKFLOW_AGENT_UNAVAILABLE`: why an agent cannot do the step now. */
        agent: Type.Optional(AgentOptionSchema),
        /** `WORKFLOW_SPECIFICATION_BUSY`: what holds the Specification ({@link SPECIFICATION_BUSY_CAUSES}). */
        cause: Type.Optional(
          Type.Unsafe<SpecificationBusyCause>(
            Type.Union(SPECIFICATION_BUSY_CAUSES.map((cause) => Type.Literal(cause))),
          ),
        ),
        /** `WORKFLOW_SPECIFICATION_BUSY` of `agent-turn` / `agent-turn-unknown`: the Session holding the claim. */
        sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
        /** `WORKFLOW_COMMIT_REFUSED`: the document refusal, with its `reason`, `cause` and `blockedBy`. */
        commit: Type.Optional(
          Type.Object(
            {
              code: Type.Unsafe<WorkflowCommitRefusalCode>(
                Type.Union(WORKFLOW_COMMIT_REFUSAL_CODES.map((code) => Type.Literal(code))),
              ),
              reason: Type.Optional(Type.String({ maxLength: 64 })),
              cause: Type.Optional(Type.String({ maxLength: 64 })),
              blockedBy: Type.Optional(Type.String({ maxLength: 64 })),
            },
            { additionalProperties: false },
          ),
        ),
      }),
    ),
  },
  { $id: 'WorkflowError', additionalProperties: false },
);
export type WorkflowError = Static<typeof WorkflowErrorSchema>;

/**
 * Ask agent (D12, D18): an agent attempt of the step the owner was shown. Without `expected.attempt`
 * a new attempt of `expected.step`; with it (Continue) a new Turn of that active agent attempt in
 * its own Session. `provider`, `model` and `effort` choose the agent of a fresh Session only (the
 * projection's `agent.launch` is the default); a continued Session keeps its own, and naming them
 * then is refused. `message` is the owner's note to the agent, after the brief. The actor is the
 * authenticated caller; the agent's actor comes from the Session, never from the body.
 */
export const AskAgentRequestSchema = Type.Object(
  {
    /** The idempotency key of this request: a repeat returns the same attempt and Turn. */
    requestId: RequestIdSchema,
    expected: Type.Object(
      { step: StepId, attempt: Type.Optional(Type.Integer({ minimum: 1 })) },
      { additionalProperties: false },
    ),
    provider: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    model: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    effort: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    message: Type.Optional(Type.String({ minLength: 1, maxLength: 20_000 })),
  },
  { additionalProperties: false },
);
export type AskAgentRequest = Static<typeof AskAgentRequestSchema>;

/** The agent attempt that runs, and the Turn just dispatched in its Session. */
export const AskAgentResultSchema = Type.Object(
  {
    kind: Type.Union([Type.Literal('started'), Type.Literal('continued')]),
    subject: WorkflowSubjectSchema,
    attemptId: Type.String(),
    step: StepId,
    attempt: Type.Integer({ minimum: 1 }),
    sessionId: Type.String(),
    turnId: Type.String(),
    /** The Session was created for this attempt (`fresh`) or continued (`reuse`). */
    session: Type.Union([Type.Literal('fresh'), Type.Literal('reuse')]),
  },
  { additionalProperties: false },
);
export type AskAgentResult = Static<typeof AskAgentResultSchema>;

/**
 * Stop the agent of the active agent attempt (D19): its running Turn is cancelled; the step stays
 * locked until SpecFlow sees the agent's process has ended, then the attempt waits for Continue,
 * Take over or Return.
 */
export const StopAgentRequestSchema = Type.Object(
  {
    requestId: RequestIdSchema,
    /** The attempt the owner was shown; another one refuses (`WORKFLOW_ATTEMPT_MISMATCH`). */
    attemptId: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);
export type StopAgentRequest = Static<typeof StopAgentRequestSchema>;

export const StopAgentResultSchema = Type.Object(
  { attemptId: Type.String(), sessionId: Type.String(), turnId: Type.String() },
  { additionalProperties: false },
);
export type StopAgentResult = Static<typeof StopAgentResultSchema>;
