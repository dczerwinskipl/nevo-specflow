import { isHttpClientError } from '@nevo/http-client';
import type { WorkflowError } from '@nevo/specflow-contracts/workflow';
import { isApiError } from '../../../api';
import { apiErrorCode } from '../../../shared/http/apiErrorCode';

type Details = NonNullable<WorkflowError['details']>;

/**
 * A refused Task command as the UI renders it: the stable `code` and the structured `details` of the
 * refusal body. The server's `message` is display-only text that is never shown (the UI explains a
 * refusal by its code).
 */
export interface TaskRefusal {
  readonly code?: string;
  /** `WORKFLOW_TASK_CONTEXT_UNRESOLVED`: the context entries (by index) that do not resolve. */
  readonly unresolved: NonNullable<Details['unresolved']>;
  /** `WORKFLOW_TASK_CONTEXT_UNRESOLVED`: required process artifacts that do not exist yet. */
  readonly awaited: NonNullable<Details['awaited']>;
  /** The request may have been applied (the answer was lost): reload before deciding again. */
  readonly outcomeUnknown: boolean;
}

function detailsOf(error: unknown): Details | undefined {
  const source = isApiError(error) ? error.cause : error;
  if (!isHttpClientError(source) || typeof source.data !== 'object' || source.data === null) {
    return undefined;
  }

  const details = (source.data as { details?: unknown }).details;

  return typeof details === 'object' && details !== null ? details : undefined;
}

export function taskRefusalOf(error: unknown): TaskRefusal {
  const details = detailsOf(error);

  return {
    code: apiErrorCode(error),
    unresolved: details?.unresolved ?? [],
    awaited: details?.awaited ?? [],
    outcomeUnknown: isApiError(error) && error.outcome === 'unknown',
  };
}

/** A stale `expectedRevision`: the Task changed since it was read. */
export const isRevisionConflict = (error: unknown) =>
  apiErrorCode(error) === 'WORKFLOW_TASK_REVISION_CONFLICT';

/**
 * The i18n key of the one-sentence explanation of a refusal (`taskAuthoring.refusal.*`), by its
 * code; codes the authoring screens do not expect fall back to a generic sentence.
 */
export function refusalMessageKey(refusal: TaskRefusal) {
  if (refusal.outcomeUnknown) {
    return 'taskAuthoring.refusal.outcomeUnknown';
  }

  switch (refusal.code) {
    case 'WORKFLOW_TASK_REVISION_CONFLICT':
      return 'taskAuthoring.refusal.revisionConflict';
    case 'WORKFLOW_TASK_EXISTS':
      return 'taskAuthoring.refusal.taskExists';
    case 'WORKFLOW_TASK_TYPE_NOT_ALLOWED':
      return 'taskAuthoring.refusal.typeNotAllowed';
    case 'WORKFLOW_DEFINITION_MISSING':
      return 'taskAuthoring.refusal.definitionMissing';
    case 'WORKFLOW_TASK_CONTEXT_UNRESOLVED':
      return 'taskAuthoring.refusal.contextUnresolved';
    case 'WORKFLOW_TASK_NOT_REMOVABLE':
      return 'taskAuthoring.refusal.notRemovable';
    case 'WORKFLOW_TASK_BUSY':
    case 'WORKFLOW_SPECIFICATION_BUSY':
    case 'CONTROL_LOCK_BUSY':
      return 'taskAuthoring.refusal.busy';
    case 'WORKFLOW_SPECIFICATION_ENDED':
      return 'taskAuthoring.refusal.specificationEnded';
    case 'WORKFLOW_INPUT_INVALID':
      return 'taskAuthoring.refusal.inputInvalid';
    case 'WORKFLOW_STATE_CONFLICT':
    case 'WORKFLOW_POSITION_INVALID':
      return 'taskAuthoring.refusal.stateChanged';
    case 'DOCUMENT_PATH_CONFLICT':
      return 'taskAuthoring.refusal.documentPathConflict';
    case 'DOCUMENT_PATH_INVALID':
      return 'taskAuthoring.refusal.documentPathInvalid';
    case 'DOCUMENT_REVISION_CONFLICT':
      return 'taskAuthoring.refusal.documentRevisionConflict';
    case 'DOCUMENT_PROTECTED':
      return 'taskAuthoring.refusal.documentProtected';
    default:
      return 'taskAuthoring.refusal.generic';
  }
}
