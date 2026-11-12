import { createHash } from 'node:crypto';

import {
  WORKFLOW_ERROR_CODES,
  type WorkflowError as WorkflowErrorContract,
  type WorkflowErrorCode,
} from '@nevo/specflow-contracts/workflow';
import { ProjectControlLockError, type OwnerActor } from '@nevo/specflow-engine';

export type WorkflowFailureStatus = 404 | 409 | 422 | 503;

export interface WorkflowFailure {
  readonly status: WorkflowFailureStatus;
  readonly body: WorkflowErrorContract;
}

const NOT_FOUND = new Set<WorkflowErrorCode>(['WORKFLOW_SUBJECT_NOT_FOUND']);
/** The request, or the definitions it depends on, cannot be accepted as given. */
const INVALID = new Set<WorkflowErrorCode>([
  'WORKFLOW_INPUT_INVALID',
  'WORKFLOW_RETURN_NOT_ALLOWED',
  'WORKFLOW_NOT_CONFIGURED',
  'WORKFLOW_DEFINITION_MISSING',
  'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
  'WORKFLOW_TASK_TYPE_IMMUTABLE',
  'WORKFLOW_TASK_CONTEXT_UNRESOLVED',
]);
const UNAVAILABLE = new Set<WorkflowErrorCode>(['WORKFLOW_STATE_CORRUPT', 'WORKFLOW_UNAVAILABLE']);

/** The Runtime has no workflow backend; recognised as a refusal by name and code. */
export class WorkflowUnavailableError extends Error {
  readonly code = 'WORKFLOW_UNAVAILABLE';

  constructor() {
    super('The workflow backend is unavailable.');
    this.name = 'WorkflowError';
  }
}

function statusOf(code: WorkflowErrorCode): WorkflowFailureStatus {
  if (NOT_FOUND.has(code)) {
    return 404;
  }

  if (INVALID.has(code)) {
    return 422;
  }

  // Everything else is the state of the run, the Task or the Specification not allowing the command
  // now: busy, blocked, conflicting, ended or changed definition.
  return UNAVAILABLE.has(code) ? 503 : 409;
}

function isWorkflowErrorCode(value: unknown): value is WorkflowErrorCode {
  return WORKFLOW_ERROR_CODES.some((code) => code === value);
}

/**
 * A workflow refusal as the stable `{error, code, message, details?}` answer, or `undefined` for a
 * defect (the caller rethrows it). The core and the SpecFlow adapter throw two classes of one name,
 * so a refusal is recognised by its name and a known `code`. `blockers` of a refused exit are
 * `details.blockers`.
 */
export function workflowFailure(error: unknown): WorkflowFailure | undefined {
  if (error instanceof ProjectControlLockError) {
    return failure('WORKFLOW_UNAVAILABLE', 'The project is busy; retry shortly.');
  }

  if (!(error instanceof Error) || error.name !== 'WorkflowError') {
    return undefined;
  }

  const { code, blockers } = error as Error & { code?: unknown; blockers?: unknown };
  if (!isWorkflowErrorCode(code)) {
    return undefined;
  }

  return failure(
    code,
    error.message,
    Array.isArray(blockers)
      ? { blockers: blockers as NonNullable<WorkflowErrorContract['details']>['blockers'] }
      : undefined,
  );
}

function failure(
  code: WorkflowErrorCode,
  message: string,
  details?: WorkflowErrorContract['details'],
): WorkflowFailure {
  return {
    status: statusOf(code),
    body: { error: code, code, message, ...(details ? { details } : {}) },
  };
}

/**
 * The owner actor of an authenticated request (`authz.readContext().subject`): the recorded actor is
 * always derived from the caller, never from the request body. The trusted local identity is
 * `trust: local`; an authenticated subject is `trust: authenticated`. An identity too long for the
 * record is stored as its digest.
 */
export function ownerActorOf(subject: string): OwnerActor {
  if (subject === 'trusted-local') {
    return { class: 'human', details: { actorId: 'runtime:trusted-local', trust: 'local' } };
  }

  const actorId =
    subject.length <= 200
      ? subject
      : 'sha256:' + createHash('sha256').update(subject).digest('hex');

  return { class: 'human', details: { actorId, trust: 'authenticated' } };
}
