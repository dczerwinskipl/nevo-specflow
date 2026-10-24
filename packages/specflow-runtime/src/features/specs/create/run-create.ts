import { randomUUID } from 'node:crypto';

import type { CreateSpecRequest, CreatedSpec } from '@nevo/specflow-contracts/specs';
import {
  createSpecificationFromRequest,
  projectCreatedSpecification,
  readRegistrySnapshot,
  willCommitCreatedScaffold,
  type CreateSpecificationRequest,
  type CreateStageObservation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { OperationProgressRegistry } from '../../operations';
import { createErrorCode } from './error-status';
import { startCreateProgress, type CreateProgress } from './progress';

export interface RunCreateInput {
  readonly engine: SpecFlowEngine;
  readonly body: CreateSpecRequest;
  /** `Prefer: respond-async`: answer as soon as the operation is validated and past its reservation. */
  readonly respondAsync: boolean;
  /** Live progress for operations that carry an id; absent disables it. */
  readonly progress?: OperationProgressRegistry | undefined;
  /** Registers the (possibly detached) Create so shutdown can wait for it. */
  readonly track: (finished: Promise<unknown>) => void;
  /** An untyped failure of a Create that was already answered with 202 (log it). */
  readonly onDetachedFailure: (error: unknown) => void;
}

export type RunCreateOutcome =
  | { readonly kind: 'accepted'; readonly operationId: string }
  | { readonly kind: 'created'; readonly created: CreatedSpec };

export const createOperationPath = (operationId: string) =>
  `/api/specs/create/operations/${operationId}`;

/**
 * The application function behind `POST /api/specs`: starts progress, runs the Engine Create and
 * decides between "accepted" (202) and "created" (201). The transport only maps the outcome.
 *
 * The work is NOT bound to the request: Node does not cancel a handler when the client
 * disconnects and the Engine takes no request signal, so the journal always runs to its outcome.
 * The `finished` promise below is the single owner of that outcome (progress included). Failures
 * before the answer are thrown to the caller.
 */
export async function runCreate(input: RunCreateInput): Promise<RunCreateOutcome> {
  const { engine, body, respondAsync } = input;
  // Async mode needs an id to answer with a Location; the client may have chosen its own.
  const operationId = body.operationId ?? (respondAsync ? randomUUID() : undefined);

  // Best-effort progress for the operation stream; never affects the outcome.
  const progress: CreateProgress | undefined =
    input.progress && operationId
      ? startCreateProgress(
          input.progress,
          operationId,
          body.target?.kind === 'new-worktree' ? 'new-worktree' : 'existing',
          await willCommitCreatedScaffold(engine),
        )
      : undefined;

  let accept: () => void = () => undefined;
  const accepted = new Promise<'accepted'>((resolve) => {
    accept = () => resolve('accepted');
  });
  const finished = (async () => {
    try {
      // Resolve default from the verified Project Home (not the HTTP server
      // process cwd or a user-provided, unverified root).
      const target = await resolveCreateTarget(engine, body.target);
      const result = await createSpecificationFromRequest(
        engine,
        {
          operationId,
          title: body.title,
          goal: body.goal,
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
          target,
          archetype: { id: body.archetypeId, version: body.archetypeVersion },
          catalogueRevision: body.catalogueRevision,
          ...(body.optionalDocumentIds !== undefined
            ? { optionalDocumentIds: body.optionalDocumentIds }
            : {}),
          ...(body.addedDocuments !== undefined ? { addedDocuments: body.addedDocuments } : {}),
          ...(body.folders !== undefined ? { folders: body.folders } : {}),
        },
        {
          onStage: (observation) => {
            progress?.onStage(observation);
            if (respondAsync && isAcceptedObservation(observation)) accept();
          },
        },
      );
      const created = projectCreatedSpecification(result);
      progress?.complete(created);
      return created;
    } catch (error) {
      progress?.fail(createErrorCode(error));
      throw error;
    }
  })();
  input.track(finished);

  if (respondAsync && operationId) {
    // A failure after acceptance is reported by progress/inspection, never lost unhandled.
    finished.catch((error: unknown) => {
      if (!createErrorCode(error)) input.onDetachedFailure(error);
    });
    const first = await Promise.race([finished, accepted]);
    return first === 'accepted'
      ? { kind: 'accepted', operationId }
      : { kind: 'created', created: first };
  }
  return { kind: 'created', created: await finished };
}

/**
 * When a respond-async request is answered 202: the operation has been validated and is past its
 * reservation (a fresh run has left `reserved`, so Git availability and the reserved plan were
 * checked), or it is a retry of work that is still running. A finished or broken journal is
 * answered with its real outcome instead.
 */
function isAcceptedObservation(observation: CreateStageObservation): boolean {
  if (observation.stage === 'completed' || observation.stage === 'recovery-required') return false;
  return observation.replayed === true || observation.stage !== 'reserved';
}

async function resolveCreateTarget(
  engine: SpecFlowEngine,
  target: CreateSpecRequest['target'],
): Promise<CreateSpecificationRequest['target']> {
  if (target === undefined) {
    return {
      kind: 'existing',
      workspaceId: (await readRegistrySnapshot(engine)).primaryWorkspaceId,
    };
  }
  return target;
}
