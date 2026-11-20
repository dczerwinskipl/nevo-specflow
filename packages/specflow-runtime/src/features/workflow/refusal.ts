import { createHash } from 'node:crypto';

import {
  SPECIFICATION_BUSY_CAUSES,
  WORKFLOW_ERROR_CODES,
  type WorkflowError as WorkflowErrorContract,
  type WorkflowErrorCode,
} from '@nevo/specflow-contracts/workflow';
import { TRUSTED_LOCAL_SUBJECT } from '../auth/authorization/request-authorization';
import {
  DocumentError,
  DraftConflictError,
  GateUnsatisfiedError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  SpecificationBusyError,
  SpecificationExitBlockedError,
  TaskContextInvalidError,
  TaskContextUnresolvedError,
  TasksOpenError,
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

  if (error instanceof DraftConflictError) {
    return failure(error.code, error.message, { draftConflicts: toWire(error.draftConflicts) });
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

  // 409: the Specification completes once its open Tasks are done or cancelled.
  if (error instanceof TasksOpenError) {
    return failure(error.code, error.message, { openTasks: toWire(error.openTasks) });
  }

  // 409: another writer holds the Specification (an agent Turn's claim names its Session).
  if (error instanceof SpecificationBusyError) {
    return failure(error.code, error.message, { ...error.busy });
  }

  // The commit admission of the workflow state refuses in the documents' vocabulary: a busy
  // checkout (a batch being committed, a full queue, a Create or Close, an agent Turn) is the same
  // busy refusal, with its cause, as the workflow's own.
  if (error instanceof DocumentError && error.code === 'SPEC_BUSY') {
    const cause = SPECIFICATION_BUSY_CAUSES.find((known) => known === error.details?.cause);

    return failure('WORKFLOW_SPECIFICATION_BUSY', error.message, cause ? { cause } : undefined);
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
 * `trust: local`; an authenticated subject is `trust: authenticated`, recorded as `<kind>:<id>`
 * (`user:ann`), not as the serialized subject key. An identity too long for the record is stored as
 * its digest.
 */
export function ownerActorOf(subject: string): OwnerActor {
  if (subject === TRUSTED_LOCAL_SUBJECT) {
    return { class: 'human', details: { actorId: 'runtime:trusted-local', trust: 'local' } };
  }

  const identity = subjectIdentity(subject);
  const actorId =
    identity.length <= 200
      ? identity
      : 'sha256:' + createHash('sha256').update(identity).digest('hex');

  return { class: 'human', details: { actorId, trust: 'authenticated' } };
}

/** `readContext().subject` serializes the Auth subject `{kind, id}`; the record keeps `kind:id`. */
function subjectIdentity(subject: string): string {
  try {
    const parsed: unknown = JSON.parse(subject);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { kind?: unknown }).kind === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      const { kind, id } = parsed as { kind: string; id: string };

      return `${kind}:${id}`;
    }
  } catch {
    // Not a serialized subject: recorded as it is.
  }

  return subject;
}
