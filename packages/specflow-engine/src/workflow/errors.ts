/**
 * Machine-readable workflow failures. Every contradiction fails closed with one of these codes and
 * never falls back to a best-effort transition.
 */
export const WORKFLOW_ERROR_CODES = [
  /** The Specification archetype has no execution binding, or a referenced definition is missing. */
  'WORKFLOW_NOT_CONFIGURED',
  /** The definition the run is pinned to is no longer the loaded one. */
  'WORKFLOW_DEFINITION_CHANGED',
  'WORKFLOW_SUBJECT_NOT_FOUND',
  /** The Specification run must exist (and have created the Task) first. */
  'WORKFLOW_SPECIFICATION_NOT_STARTED',
  /** The requested attempt is not the active one. */
  'WORKFLOW_ATTEMPT_MISMATCH',
  /** The operation is not allowed in the current position. */
  'WORKFLOW_POSITION_INVALID',
  'WORKFLOW_TASK_BLOCKED',
  'WORKFLOW_DEPENDENCY_UNSATISFIED',
  /** The finish result selects no transition or the input breaks the step contract. */
  'WORKFLOW_INPUT_INVALID',
  'WORKFLOW_RETURN_NOT_ALLOWED',
  /** The executor may not do this step (an agent never finishes a human step). */
  'WORKFLOW_EXECUTOR_NOT_ALLOWED',
  /** Stored state does not match the expected revision (a concurrent writer). */
  'WORKFLOW_STATE_CONFLICT',
  /** Stored state cannot be parsed or is incoherent. */
  'WORKFLOW_STATE_CORRUPT',
] as const;
export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[number];

export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}
