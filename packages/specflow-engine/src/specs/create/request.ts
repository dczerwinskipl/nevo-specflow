import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import { normalizeCreateClientIntent, type CreateClientTargetInput } from './intent';
import { CreateOperationError } from './error';
import {
  createSpecificationWithIntent,
  inspectCreateSpecification,
  type CreatedSpecification,
  type CreateStageObserver,
} from './durable';

/** Transport-neutral request: optional overrides preserve user omission. */
export interface CreateSpecificationRequest {
  readonly operationId?: string;
  readonly title: string;
  readonly goal?: string;
  readonly slug?: string;
  readonly target: CreateClientTargetInput;
}

export interface CreateSpecificationRequestOptions {
  /** Read-only notification of durable stage transitions, for progress reporting. */
  readonly onStage?: CreateStageObserver;
}

export async function createSpecificationFromRequest(
  engine: SpecFlowEngine,
  request: CreateSpecificationRequest,
  options: CreateSpecificationRequestOptions = {},
): Promise<CreatedSpecification> {
  // No date or ref defaults are chosen outside the Project Home lock. An
  // existing journal is inspected before sampling a fresh clock.
  return createSpecificationWithIntent(
    engine,
    request.operationId ?? randomUUID(),
    normalizeCreateClientIntent(request),
    () => new Date().toISOString().slice(0, 10),
    options.onStage ? { onStage: options.onStage } : {},
  );
}

export interface ResumeCreateOptions {
  /**
   * The operator confirms that no process of the original Create is still running. Never inferred
   * from elapsed time; it is the only way a non terminal journal is taken over.
   */
  readonly confirmOriginalStopped: true;
  /** Additionally required from stage `git-initiated`: no Git process of the original run is running. */
  readonly confirmInterruptedGitSettled?: boolean;
}

/**
 * Operator recovery of an interrupted Create: replays the durable journal with the intent it
 * recorded (so no request has to be remembered) and drives it to its outcome. The Engine keeps its
 * verification (exact refs, paths, HEAD, committed bytes) and still fails closed on a mismatch.
 */
export async function resumeInterruptedCreateOperation(
  engine: SpecFlowEngine,
  operationId: string,
  options: ResumeCreateOptions,
  onStage?: CreateStageObserver,
): Promise<CreatedSpecification> {
  const journal = await inspectCreateSpecification(engine, operationId);
  if (!journal) {
    throw new CreateOperationError('CREATE_OPERATION_INVALID', 'No Create operation with this id.');
  }
  return createSpecificationWithIntent(
    engine,
    operationId,
    journal.requestIntent,
    () => journal.created,
    {
      resumeInterruptedOperation: options.confirmOriginalStopped,
      ...(options.confirmInterruptedGitSettled ? { confirmInterruptedGitSettled: true } : {}),
      ...(onStage ? { onStage } : {}),
    },
  );
}
