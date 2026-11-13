import { isHttpClientError } from '@nevo/http-client';
import type { ExitBlocker, GateStatus, WorkflowError } from '@nevo/specflow-contracts/workflow';
import { isApiError } from '../../../api';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';

type Details = NonNullable<WorkflowError['details']>;

/**
 * A refused workflow command as the UI renders it: the stable `code`, the gates or exit blockers the
 * refusal names, and whether the request may have been applied. The server `message` is never shown.
 */
export interface WorkflowRefusal {
  readonly code?: string;
  /** `WORKFLOW_GATE_UNSATISFIED`: the gates that held the start or the finish. */
  readonly gates: readonly GateStatus[];
  /** `WORKFLOW_EXIT_BLOCKED` (`details.blockers`) or `CLOSE_BLOCKED` (`blockers`). */
  readonly blockers: readonly ExitBlocker[];
  /** A producing finish kept drafts that depend on drafts it cancels (`details.draftConflicts`). */
  readonly draftConflicts: NonNullable<Details['draftConflicts']>;
  /** The answer was lost: the request may have been applied. */
  readonly outcomeUnknown: boolean;
}

function bodyOf(error: unknown): Record<string, unknown> | undefined {
  const source = isApiError(error) ? error.cause : error;
  if (!isHttpClientError(source) || typeof source.data !== 'object' || source.data === null) {
    return undefined;
  }

  return source.data as Record<string, unknown>;
}

export function workflowRefusalOf(error: unknown): WorkflowRefusal {
  const body = bodyOf(error);
  const details = body?.details as Details | undefined;
  const closeBlockers = Array.isArray(body?.blockers)
    ? (body.blockers as readonly ExitBlocker[])
    : undefined;

  return {
    code: apiErrorCode(error),
    gates: details?.gate?.gates ?? [],
    blockers: details?.blockers ?? closeBlockers ?? [],
    draftConflicts: details?.draftConflicts ?? [],
    outcomeUnknown: isApiError(error) && error.outcome === 'unknown',
  };
}

/**
 * The i18n key of the one sentence that explains a refused workflow command (`workflowExecution.refusal.*`).
 */
export function workflowRefusalKey(refusal: WorkflowRefusal) {
  if (refusal.outcomeUnknown) {
    return 'workflowExecution.refusal.outcomeUnknown';
  }

  if (refusal.draftConflicts.length > 0) {
    return 'workflowExecution.refusal.draftConflict';
  }

  switch (refusal.code) {
    case 'WORKFLOW_DEFINITION_CHANGED':
      return 'workflowExecution.refusal.definitionChanged';
    case 'WORKFLOW_ATTEMPT_MISMATCH':
    case 'WORKFLOW_POSITION_INVALID':
    case 'WORKFLOW_STATE_CONFLICT':
      return 'workflowExecution.refusal.stateChanged';
    case 'WORKFLOW_GATE_UNSATISFIED':
      return 'workflowExecution.refusal.gateUnsatisfied';
    case 'WORKFLOW_TASK_TYPE_NOT_ALLOWED':
      return 'workflowExecution.refusal.typeNotAllowed';
    case 'WORKFLOW_DEFINITION_MISSING':
      return 'workflowExecution.refusal.definitionMissing';
    case 'WORKFLOW_TASK_CONTEXT_UNRESOLVED':
      return 'workflowExecution.refusal.contextUnresolved';
    case 'WORKFLOW_DEPENDENCY_UNSATISFIED':
    case 'WORKFLOW_TASK_BLOCKED':
      return 'workflowExecution.refusal.taskBlocked';
    case 'WORKFLOW_INPUT_INVALID':
      return 'workflowExecution.refusal.inputInvalid';
    case 'WORKFLOW_RETURN_NOT_ALLOWED':
      return 'workflowExecution.refusal.returnNotAllowed';
    case 'WORKFLOW_SPECIFICATION_ENDED':
      return 'workflowExecution.refusal.specificationEnded';
    case 'WORKFLOW_EXIT_BLOCKED':
    case 'CLOSE_BLOCKED':
      return 'workflowExecution.refusal.exitBlocked';
    case 'WORKFLOW_TASK_BUSY':
    case 'WORKFLOW_SPECIFICATION_BUSY':
    case 'CONTROL_LOCK_BUSY':
      return 'workflowExecution.refusal.busy';
    default:
      return 'workflowExecution.refusal.generic';
  }
}
