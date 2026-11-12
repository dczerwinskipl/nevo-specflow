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
  /** Unfinished work or pending writes hold the Specification; the error lists them (`blockers`). */
  'WORKFLOW_EXIT_BLOCKED',
] as const;
export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[number];

export class WorkflowError extends CoreWorkflowError<WorkflowErrorCode> {}
