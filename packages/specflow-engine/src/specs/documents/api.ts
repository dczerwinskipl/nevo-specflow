import type { SpecFlowEngine } from '../../application';
import { hasPendingTaskResourceChange } from '../../workflow/state/pending-task-change';
import { assertSharedResourcesAvailable } from '../coordination/resources';
import type { DocumentWriteRequest } from './changes/plan/request';
import { catalogueTemplateResolver } from './templates/resolve';
import { documentAndManualCommitViews } from './manual-commit';
import { notifyDocumentChangeApplied } from './scheduler/notifier';
import {
  admitExecutionStateCommit,
  type ExecutionStateCommitOptions,
  type ExecutionStateWrite,
} from './write/execution-state';
import {
  replayDocumentChange,
  writeDocumentChange,
  type DocumentChangeResult,
  type DocumentWriteDependencies,
  type DocumentWriteOptions,
} from './write';

/**
 * The document write use cases as the Runtime and the CLI call them: the writer of `./write` bound
 * to the cross-slice claim check (Create, Close and document journals) that only the composition
 * may import. Authorization is the caller's.
 */
export const documentWriteDependencies: DocumentWriteDependencies = {
  assertClaims: assertSharedResourcesAvailable,
  taskResourceChangePending: (context, specId, taskId) =>
    hasPendingTaskResourceChange(context.project.stateRoot, specId, taskId),
};

/** The reservation consults the real batch records unless a caller supplies its own view. */
function withBatchViews(options: DocumentWriteOptions | undefined): DocumentWriteOptions {
  return {
    ...options,
    batches: options?.batches ?? documentAndManualCommitViews,
    templates: options?.templates ?? catalogueTemplateResolver,
  };
}

/**
 * Applies one document change (save, batch save, create, folder, rename, move, delete, classify):
 * files and registry on disk at once, the journal `queued`, the answer carrying the commit state. The
 * same `operationId` replays (see `writeDocumentChange`).
 */
export async function applyDocumentChange(
  engine: SpecFlowEngine,
  specId: string,
  operationId: string,
  request: DocumentWriteRequest,
  options?: DocumentWriteOptions,
): Promise<DocumentChangeResult> {
  const result = await writeDocumentChange(
    engine,
    documentWriteDependencies,
    { kind: 'specification', specId },
    operationId,
    request,
    withBatchViews(options),
  );
  wake(engine, result);

  return result;
}

/**
 * Applies one change of a Task's documents (T5): save, batch save, create of typed documents,
 * rename or delete of a document, with the same revisions, journal, claims, commit policy and
 * replay as {@link applyDocumentChange}. The registry is the Task's `task.yaml` `documents[]`; the
 * `task` document cannot be deleted or renamed. Refused (`SPEC_BUSY`, `task-resource-change`) while
 * the Specification execution store holds a pending change of the Task (D03).
 */
export async function applyTaskDocumentChange(
  engine: SpecFlowEngine,
  specId: string,
  taskId: string,
  operationId: string,
  request: DocumentWriteRequest,
  options?: DocumentWriteOptions,
): Promise<DocumentChangeResult> {
  const result = await writeDocumentChange(
    engine,
    documentWriteDependencies,
    { kind: 'task', specId, taskId },
    operationId,
    request,
    withBatchViews(options),
  );
  wake(engine, result);

  return result;
}

/** Continues an operation by its id: the stored result, or a roll-forward of an interrupted write. */
export async function resumeDocumentChange(
  engine: SpecFlowEngine,
  operationId: string,
  options?: DocumentWriteOptions,
): Promise<DocumentChangeResult> {
  const result = await replayDocumentChange(
    engine,
    documentWriteDependencies,
    operationId,
    withBatchViews(options),
  );
  wake(engine, result);

  return result;
}

/** A change that now waits for its commit wakes the scheduler of this process, if one runs. */
function wake(engine: SpecFlowEngine, result: DocumentChangeResult): void {
  if (result.stage === 'queued') {
    notifyDocumentChangeApplied({ stateRoot: engine.context.project.stateRoot });
  }
}

/**
 * The commit policy of the Specification execution store's writes (`write/execution-state.ts`),
 * bound to the cross-slice claim check and the real batch records. Under the project control lock.
 */
export async function admitExecutionStateChange(
  engine: SpecFlowEngine,
  specId: string,
  paths: readonly string[],
  operationId: string,
  options?: ExecutionStateCommitOptions,
): Promise<{
  record(summary: string, writes: readonly ExecutionStateWrite[]): Promise<void>;
}> {
  const admitted = await admitExecutionStateCommit(
    engine,
    { assertClaims: assertSharedResourcesAvailable, batches: documentAndManualCommitViews },
    specId,
    paths,
    operationId,
    options,
  );

  return {
    async record(summary, writes) {
      const recorded = await admitted.record(summary, writes);
      // A change that now waits for its commit wakes the scheduler of this process, if one runs.
      if (recorded === 'queued') {
        notifyDocumentChangeApplied({ stateRoot: engine.context.project.stateRoot });
      }
    },
  };
}

/** D03, for the Specification execution store (Task edit, removal, status, Close): see the module. */
export { hasPendingTaskDocumentChange } from './write/pending-task-change';
