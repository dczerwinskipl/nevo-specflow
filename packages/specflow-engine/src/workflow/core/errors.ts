/**
 * Failures of the neutral workflow core. Every contradiction fails closed with one of these codes and
 * never falls back to a best-effort transition. A host may add codes of its own (`TCode`); the core
 * only ever throws its own.
 */
export const WORKFLOW_CORE_ERROR_CODES = [
  /** The definition the run is pinned to is not the one given. */
  'WORKFLOW_DEFINITION_CHANGED',
  /** The command names an attempt that is not the active one, or repeats a finish differently. */
  'WORKFLOW_ATTEMPT_MISMATCH',
  /** The command is not allowed in the run's current position. */
  'WORKFLOW_POSITION_INVALID',
  /** The result selects no transition or the input breaks the step contract. */
  'WORKFLOW_INPUT_INVALID',
  'WORKFLOW_RETURN_NOT_ALLOWED',
  /** The actor's class may not work on the step, or is not the class of the attempt it continues. */
  'WORKFLOW_EXECUTOR_NOT_ALLOWED',
  /** The run does not follow from its history, or refers to what the definition does not declare. */
  'WORKFLOW_STATE_CORRUPT',
] as const;
export type WorkflowCoreErrorCode = (typeof WORKFLOW_CORE_ERROR_CODES)[number];

export class WorkflowError<TCode extends string = WorkflowCoreErrorCode> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
  }
}
