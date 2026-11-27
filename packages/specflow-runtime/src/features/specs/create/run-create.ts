import { randomUUID } from 'node:crypto';

import type { CreateSpecRequest, CreatedSpec } from '@nevo/specflow-contracts/specs';
import {
  CreateOperationError,
  createSpecificationFromRequest,
  projectCreatedSpecification,
  readRegistrySnapshot,
  willCommitCreatedScaffold,
  type CreateSpecificationRequest,
  type CreateStageObservation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { OperationProgressRegistry } from '../../operations';
import { createErrorCode, statusForCreateError } from './error-status';
import type { CreateFirstStep } from './first-step';
import { isRecoveryCode, startCreateProgress, type CreateProgress } from './progress';
import type { CreateRequestStore } from './request-store';

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
  /**
   * The first-step intent owner and who asks (the principal the agent start runs as). Absent: this
   * Runtime runs no agent, and a request with `firstStep` is refused.
   */
  readonly firstStep?: { readonly owner: CreateFirstStep; readonly principal: string } | undefined;
  /**
   * The Runtime's record of accepted Creates and who asked: written before the Engine reserves
   * anything, so a Runtime that dies mid-Create resumes it at its next start. Absent (tests): the
   * operation is not resumed by the Runtime.
   */
  readonly requests?:
    | { readonly store: CreateRequestStore; readonly principal: string; readonly now?: () => Date }
    | undefined;
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
  // Async mode needs an id to answer with a Location; the client may have chosen its own. A
  // first-step intent is stored under the operation, so it needs one too.
  const operationId =
    body.operationId ?? (respondAsync || body.firstStep ? randomUUID() : undefined);
  if (body.firstStep && !input.firstStep) {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'This Runtime runs no agent, so a Create cannot start its first step with one.',
    );
  }

  // The intent is admitted and stored before the Engine writes anything (a retry must carry the same).
  const firstStep = input.firstStep;
  const intent =
    firstStep && operationId
      ? await firstStep.owner.admit({
          engine,
          operationId,
          request: body.firstStep,
          archetypeId: body.archetypeId,
          principal: firstStep.principal,
        })
      : undefined;

  // The operation the owner started is durable from here on, before the Engine writes anything.
  const requests = input.requests && operationId ? input.requests : undefined;
  if (requests && operationId) {
    const earlier = await requests.store.read(operationId);
    await requests.store.write({
      version: 1,
      operationId,
      principal: earlier?.principal ?? requests.principal,
      request: { ...body, operationId },
      createdAt: earlier?.createdAt ?? (requests.now ?? (() => new Date()))().toISOString(),
    });
  }

  // Best-effort progress for the operation stream; never affects the outcome.
  const progress: CreateProgress | undefined =
    input.progress && operationId
      ? startCreateProgress(
          input.progress,
          operationId,
          body.target?.kind === 'new-worktree' ? 'new-worktree' : 'existing',
          await willCommitCreatedScaffold(engine),
          intent !== undefined,
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
            if (respondAsync && isAcceptedObservation(observation)) {
              accept();
            }
          },
        },
      );
      const created: CreatedSpec = projectCreatedSpecification(result);
      // The Engine journal is complete and durable: it, and the first-step intent, carry the rest.
      if (requests && operationId) {
        await requests.store.remove(operationId).catch(() => undefined);
      }

      if (!intent || !firstStep) {
        progress?.complete(created);

        return created;
      }

      // The Specification exists; the agent start is the last step of the same operation. A refused
      // start never fails the Create: its result says why.
      progress?.startingAgent();
      const started = await firstStep.owner.settle(intent, created.specId);
      if (!started) {
        // Not settled (it may pass, or the Runtime is stopping): the intent stays pending, the
        // operation stays in progress and the startup step makes the start after a restart.
        return created;
      }

      if (started.status === 'not-started') {
        progress?.agentNotStarted();
      }

      const withFirstStep: CreatedSpec = { ...created, firstStep: started };
      progress?.complete(withFirstStep);

      return withFirstStep;
    } catch (error) {
      const code = createErrorCode(error);
      progress?.fail(code);
      if (requests && operationId && code !== undefined) {
        // The operation stays readable with how it ended; an open outcome is tried again at the next
        // Runtime start, a refusal is final.
        await requests.store
          .read(operationId)
          .then((record) =>
            record
              ? requests.store.write({
                  ...record,
                  failure: { code, definite: statusForCreateError(code) < 500 },
                })
              : undefined,
          )
          .catch(() => undefined);
      }

      if (intent && firstStep && operationId) {
        // A definite refusal ends the operation: its intent goes with it. An uncertain outcome
        // keeps it for the retry with the same operation id.
        await firstStep.owner
          .forgetFailed(engine, operationId, code !== undefined && !isRecoveryCode(code))
          .catch(() => undefined);
      }

      throw error;
    }
  })();
  input.track(finished);

  if (respondAsync && operationId) {
    // A failure after acceptance is reported by progress/inspection, never lost unhandled.
    finished.catch((error: unknown) => {
      if (!createErrorCode(error)) {
        input.onDetachedFailure(error);
      }
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
  if (observation.stage === 'completed' || observation.stage === 'recovery-required') {
    return false;
  }

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
