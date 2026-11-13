import { createHash } from 'node:crypto';

import {
  WORKFLOW_ERROR_CODES,
  type WorkflowError as WorkflowErrorContract,
  type WorkflowErrorCode,
} from '@nevo/specflow-contracts/workflow';
import { TRUSTED_LOCAL_SUBJECT } from '../auth/authorization/request-authorization';
import {
  GateUnsatisfiedError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  SpecificationExitBlockedError,
  TaskContextInvalidError,
  TaskContextUnresolvedError,
  WorkspaceRegistryError,
  type OwnerActor,
} from '@nevo/specflow-engine';
import type { FastifyReply } from 'fastify';

import { toWire } from './wire';

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
const UNAVAILABLE = new Set<WorkflowErrorCode>([
  'WORKFLOW_STATE_CORRUPT',
  'WORKFLOW_UNAVAILABLE',
  'CONTROL_LOCK_BUSY',
  'CONTROL_LOCK_CORRUPT',
  'CONTROL_LOCK_OWNERSHIP_LOST',
  'CONTROL_LOCK_INVALID_HOME',
]);

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
    return failure(error.code, error.message);
  }

  // The Engine's Specification lookup refuses a Specification itself; its message may name paths.
  if (error instanceof SpecificationError) {
    return specificationFailure(error);
  }

  // The canonical source (registry, Project Home, Git) cannot be used now.
  if (
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError ||
    error instanceof GitCapabilityError
  ) {
    return failure('WORKFLOW_UNAVAILABLE', 'The Specification source is unavailable.');
  }

  if (error instanceof SpecificationExitBlockedError) {
    return failure(error.code, error.message, {
      blockers: error.blockers.map((blocker) => ({
        ...blocker,
        subjectIds: [...blocker.subjectIds],
      })),
    });
  }

  if (error instanceof TaskContextUnresolvedError) {
    return failure(error.code, error.message, {
      unresolved: [...error.unresolved],
      ...(error.awaited.length > 0 ? { awaited: [...error.awaited] } : {}),
    });
  }

  if (error instanceof TaskContextInvalidError) {
    return failure(error.code, error.message, { invalidContext: toWire(error.invalidContext) });
  }

  // 409: the documents the gate needs are not there yet; the same request can succeed later.
  if (error instanceof GateUnsatisfiedError) {
    return failure(error.code, error.message, {
      gate: {
        phase: error.phase,
        step: error.step,
        stepTitle: error.stepTitle,
        gates: toWire(error.gates),
      },
    });
  }

  if (!(error instanceof Error) || error.name !== 'WorkflowError') {
    return undefined;
  }

  const { code } = error as Error & { code?: unknown };

  return isWorkflowErrorCode(code) ? failure(code, error.message) : undefined;
}

/** The workflow refusal of each Specification lookup failure. */
function specificationFailure(error: SpecificationError): WorkflowFailure {
  switch (error.code) {
    case 'SPEC_NOT_FOUND':
      return failure('WORKFLOW_SUBJECT_NOT_FOUND', 'The Specification does not exist.');
    case 'SPEC_VALIDATION_ERROR':
      return failure('WORKFLOW_INPUT_INVALID', 'The Specification identity is not valid.');
    case 'SPEC_CONFLICT':
      return failure(
        'WORKFLOW_STATE_CONFLICT',
        'The Specification conflicts with another canonical Specification.',
      );
    case 'SPEC_SOURCE_INVALID':
      return failure('WORKFLOW_UNAVAILABLE', 'The Specification source is unavailable.');
    default: {
      const exhaustive: never = error.code;

      return exhaustive;
    }
  }
}

/**
 * Answers a refusal: its status and `WorkflowError` body (which every workflow and Task command route
 * declares), with `Retry-After` only for `CONTROL_LOCK_BUSY`, the one refusal a retry soon can fix.
 */
export function sendWorkflowFailure(reply: FastifyReply, failure: WorkflowFailure): FastifyReply {
  if (failure.body.code === 'CONTROL_LOCK_BUSY') {
    reply.header('Retry-After', '1');
  }

  return reply.code(failure.status).send(failure.body);
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
  if (subject === TRUSTED_LOCAL_SUBJECT) {
    return { class: 'human', details: { actorId: 'runtime:trusted-local', trust: 'local' } };
  }

  const actorId =
    subject.length <= 200
      ? subject
      : 'sha256:' + createHash('sha256').update(subject).digest('hex');

  return { class: 'human', details: { actorId, trust: 'authenticated' } };
}
