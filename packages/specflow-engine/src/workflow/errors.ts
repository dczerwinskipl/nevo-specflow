import { WORKFLOW_CORE_ERROR_CODES, WorkflowError as CoreWorkflowError } from './core';

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
] as const;
export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[number];

export class WorkflowError extends CoreWorkflowError<WorkflowErrorCode> {}
