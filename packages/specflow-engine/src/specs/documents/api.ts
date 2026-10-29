import type { SpecFlowEngine } from '../../application';
import { assertSharedResourcesAvailable } from '../coordination/resources';
import type { DocumentWriteRequest } from './changes/plan/request';
import { catalogueTemplateResolver } from './templates/resolve';
import { documentAndManualCommitViews } from './manual-commit';
import { notifyDocumentChangeApplied } from './scheduler/notifier';
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
    specId,
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
