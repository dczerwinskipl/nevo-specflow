import type { TaskCommandError } from '@nevo/specflow-contracts/tasks';
import {
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  WORKFLOW_ERROR_CODES,
  WorkspaceRegistryError,
  type WorkflowErrorCode,
} from '@nevo/specflow-engine';

import { workflowErrorCode } from '../engine/sources';

export type TaskCommandStatus = 404 | 409 | 422 | 503;

/**
 * The HTTP status of every workflow error code (exhaustive, so a new Engine code cannot be
 * forgotten), consistent with the document routes: the subject does not exist (404); the request
 * conflicts with the current state, a concurrent writer or an unsettled operation, and repeating it
 * later or against the current revision can succeed (409); the request itself is not acceptable
 * under the definitions and references as they are (422); the stored state cannot be interpreted
 * (503, restore from Git).
 */
export function statusForWorkflowError(code: WorkflowErrorCode): TaskCommandStatus {
  switch (code) {
    case 'WORKFLOW_SUBJECT_NOT_FOUND':
      return 404;

    case 'WORKFLOW_DEFINITION_CHANGED':
    case 'WORKFLOW_ATTEMPT_MISMATCH':
    case 'WORKFLOW_POSITION_INVALID':
    case 'WORKFLOW_RETURN_NOT_ALLOWED':
    case 'WORKFLOW_EXECUTOR_NOT_ALLOWED':
    case 'WORKFLOW_SPECIFICATION_NOT_STARTED':
    case 'WORKFLOW_TASK_BLOCKED':
    case 'WORKFLOW_DEPENDENCY_UNSATISFIED':
    case 'WORKFLOW_STATE_CONFLICT':
    case 'WORKFLOW_TASK_EXISTS':
    case 'WORKFLOW_TASK_REVISION_CONFLICT':
    case 'WORKFLOW_TASK_NOT_REMOVABLE':
    case 'WORKFLOW_TASK_BUSY':
    case 'WORKFLOW_SPECIFICATION_ENDED':
    case 'WORKFLOW_SPECIFICATION_BUSY':
    case 'WORKFLOW_EXIT_BLOCKED':
      return 409;

    case 'WORKFLOW_INPUT_INVALID':
    case 'WORKFLOW_NOT_CONFIGURED':
    case 'WORKFLOW_TASK_TYPE_NOT_ALLOWED':
    case 'WORKFLOW_TASK_TYPE_IMMUTABLE':
    case 'WORKFLOW_DEFINITION_MISSING':
    case 'WORKFLOW_TASK_CONTEXT_UNRESOLVED':
      return 422;

    case 'WORKFLOW_STATE_CORRUPT':
      return 503;

    default: {
      const exhaustive: never = code;

      return exhaustive;
    }
  }
}

export interface TaskCommandFailure {
  readonly status: TaskCommandStatus;
  readonly body: TaskCommandError;
}

const KNOWN = new Set<string>(WORKFLOW_ERROR_CODES);

/** No workflow source (a Runtime without an Engine). */
export const SOURCE_UNAVAILABLE: TaskCommandFailure = {
  status: 503,
  body: { error: 'WORKFLOW_SOURCE_UNAVAILABLE', code: 'WORKFLOW_SOURCE_UNAVAILABLE' },
};

/**
 * The answer to a workflow refusal, or `undefined` for anything else (a defect, answered 500 by the
 * Runtime error handler). A refusal carries the Engine's explanation (for example which context
 * entries do not resolve); an outage (503) carries the code only.
 */
export function taskCommandFailure(error: unknown): TaskCommandFailure | undefined {
  // The Specification lookup of the Engine (discovery) refuses an unknown Specification itself.
  if (error instanceof SpecificationError && error.code === 'SPEC_NOT_FOUND') {
    return {
      status: 404,
      body: { error: 'WORKFLOW_SUBJECT_NOT_FOUND', code: 'WORKFLOW_SUBJECT_NOT_FOUND' },
    };
  }

  // The canonical source (manifest, registry, Project Home, control lock, Git) cannot be used.
  if (
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError ||
    error instanceof ProjectControlLockError ||
    error instanceof GitCapabilityError
  ) {
    return SOURCE_UNAVAILABLE;
  }

  const code = workflowErrorCode(error);
  if (code === undefined || !KNOWN.has(code)) {
    return undefined;
  }

  const status = statusForWorkflowError(code as WorkflowErrorCode);

  return {
    status,
    body: {
      error: code,
      code,
      ...(status !== 503 && error instanceof Error ? { message: error.message } : {}),
    },
  };
}
