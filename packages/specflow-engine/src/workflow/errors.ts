import { WORKFLOW_CORE_ERROR_CODES, WorkflowError as CoreWorkflowError } from '@nevo/workflow';

/**
 * Machine-readable workflow failures: the core's codes (thrown by the coordinator) and the ones the
 * SpecFlow adapter adds. Every contradiction fails closed with one of these codes and never falls
 * back to a best-effort transition. The core throws its own `WorkflowError`; this subclass only
 * types the adapter's codes, so callers match on `code` (or the core class), not on this subclass.
 */
export const WORKFLOW_ERROR_CODES = [
  ...WORKFLOW_CORE_ERROR_CODES,
  /** The Specification archetype has no execution binding, or a referenced definition is missing. */
  'WORKFLOW_NOT_CONFIGURED',
  'WORKFLOW_SUBJECT_NOT_FOUND',
  /** The Specification run must exist (and have created the Task) first. */
  'WORKFLOW_SPECIFICATION_NOT_STARTED',
  'WORKFLOW_TASK_BLOCKED',
  'WORKFLOW_DEPENDENCY_UNSATISFIED',
  /** Stored state does not match the expected revision (a concurrent writer). */
  'WORKFLOW_STATE_CONFLICT',
  /** A Task with the id exists already, or its folder, index entry or run record is in the way. */
  'WORKFLOW_TASK_EXISTS',
  /** The task type is not allowed by the effective policy (the Specification run's snapshot, else the archetype). */
  'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
  /** A Task's type is fixed at creation; an edit may not change it. */
  'WORKFLOW_TASK_TYPE_IMMUTABLE',
  /** The task type, or the workflow it runs, is not defined (any more). */
  'WORKFLOW_DEFINITION_MISSING',
  /** Context references that do not resolve: refused on create/edit, required ones block a start. */
  'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
  /** The Task changed since the revision the caller planned its edit or removal against. */
  'WORKFLOW_TASK_REVISION_CONFLICT',
  /** The Task started, has dependents, a pending document change or files the Engine does not know. */
  'WORKFLOW_TASK_NOT_REMOVABLE',
  /** A change of one of the Task's documents is pending (D03): its files cannot be written now. */
  'WORKFLOW_TASK_BUSY',
  /** The Specification's workflow ended already: completed, or abandoned (for another reason). */
  'WORKFLOW_SPECIFICATION_ENDED',
  /**
   * Another writer holds the Specification: an agent Session Turn's project-wide write claim, or an
   * unsettled Close of it. Thrown as {@link SpecificationBusyError}, which names the holder.
   */
  'WORKFLOW_SPECIFICATION_BUSY',
  /** Unfinished work or pending writes hold the Specification; the error lists them (`blockers`). */
  'WORKFLOW_EXIT_BLOCKED',
  /** A declared entry or exit gate of the step does not hold; the error lists them (`gates`). */
  'WORKFLOW_GATE_UNSATISFIED',
  /** A Specification cannot complete while Tasks are open; the error lists them (`openTasks`). */
  'WORKFLOW_TASKS_OPEN',
  /**
   * An agent's finish proposal takes a decision only the owner takes: a transition with an
   * owner-authority effect or `confirmation: owner`, or status decisions on Tasks.
   */
  'WORKFLOW_OWNER_DECISION_REQUIRED',
  /**
   * Ask agent attribution (B3, B6), thrown as `AttributionRefusalError` naming the paths: the
   * checkout has changes the Engine cannot attribute at an agent attempt's start
   * (`WORKFLOW_DIRTY_BASELINE`), files changed since the attempt's last Turn ended at Continue
   * (`WORKFLOW_BASELINE_CHANGED`), and at an agent finish new files of a Specification directory
   * without a document type (`WORKFLOW_UNREGISTERED_DOCUMENTS`, D14), Engine-written files whose
   * bytes are not the Engine's (`WORKFLOW_ENGINE_FILE_EDITED`), or changed files the proposal does
   * not declare exactly (`WORKFLOW_UNDECLARED_CHANGES`).
   */
  'WORKFLOW_DIRTY_BASELINE',
  'WORKFLOW_BASELINE_CHANGED',
  'WORKFLOW_UNREGISTERED_DOCUMENTS',
  'WORKFLOW_ENGINE_FILE_EDITED',
  'WORKFLOW_UNDECLARED_CHANGES',
] as const;
export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[number];

export class WorkflowError extends CoreWorkflowError<WorkflowErrorCode> {}

/**
 * Why a Specification is busy (`WORKFLOW_SPECIFICATION_BUSY`): an agent Turn's claim (`agent-turn`,
 * or `agent-turn-unknown` once that Turn ended without a verified outcome), an unsettled Close
 * (`close`), or a busy cause of the workflow state's commit admission (the documents' `SPEC_BUSY`
 * causes). `other`: a busy refusal whose cause this list does not know, kept as a refusal rather than
 * dropped. The Runtime's contract test keeps the contracts' list equal to this one.
 */
export const SPECIFICATION_BUSY_CAUSES = [
  'agent-turn',
  'agent-turn-unknown',
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
 * What holds a busy Specification, the `details` of `WORKFLOW_SPECIFICATION_BUSY`: the cause and,
 * for an agent Turn's claim, its Session.
 */
export interface SpecificationBusy {
  readonly cause: SpecificationBusyCause;
  readonly sessionId?: string;
}

/**
 * `WORKFLOW_SPECIFICATION_BUSY`: the workflow of the Specification cannot change now, and why. The
 * message names the holder and the remedy. `claim` is the execution claim met (in-process only, for
 * a host that reacts to its own agent's claim; it is never sent).
 */
export class SpecificationBusyError extends WorkflowError {
  readonly busy: SpecificationBusy;
  readonly claim: { readonly operationId: string; readonly sessionId: string } | undefined;

  constructor(
    message: string,
    busy: SpecificationBusy,
    claim?: { readonly operationId: string; readonly sessionId: string },
  ) {
    super('WORKFLOW_SPECIFICATION_BUSY', message);
    this.busy = busy;
    this.claim = claim;
  }
}
