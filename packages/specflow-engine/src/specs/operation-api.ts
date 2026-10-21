import type { SpecFlowEngine } from '../application';
import { closeSpecification } from './lifecycle/close-specification';
import { closeWorktree } from './lifecycle/close-worktree';
import { previewCloseOperation, type CloseRequest } from './lifecycle/preflight';
import { inspectCloseOperation } from './lifecycle/reservation';
import { reconcileArchivedConflictScratch } from './lifecycle/git-scratch';
import { CloseOperationError } from './lifecycle/model';
import {
  projectCloseOperation,
  projectClosePreview,
  type PublicCloseOperation,
  type PublicClosePreview,
} from './operation-projection';

/**
 * Supported Engine application API for CLI and HTTP.
 * A durable journal is an internal recovery authority, never a regular
 * operation response or a method exposed from the Engine package root.
 */
export interface PublicCloseInspection extends PublicCloseOperation {
  readonly integrationRequired: boolean;
}

export async function inspectPublicCloseOperation(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<PublicCloseInspection | undefined> {
  const journal = await inspectCloseOperation(engine, operationId);
  if (!journal) return undefined;
  return {
    ...projectCloseOperation(journal),
    integrationRequired:
      journal.plan.kind === 'worktree-close' || journal.plan.integrateToTargetBranch === true,
  };
}

export async function previewPublicCloseOperation(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<PublicClosePreview> {
  return projectClosePreview(await previewCloseOperation(engine, request));
}

/** Resolve immutable retry authorization from the journal, never mutable query options. */
export async function planPublicCloseOperation(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<PublicClosePreview> {
  if (!request.operationId) return previewPublicCloseOperation(engine, request);
  const existing = await inspectCloseOperation(engine, request.operationId);
  if (existing) {
    if (existing.plan.specId !== request.specId || existing.plan.kind !== request.kind) {
      throw new CloseOperationError('CLOSE_CONFLICT', 'Operation identity does not match intent.');
    }
    return projectClosePreview(existing.plan);
  }
  return previewPublicCloseOperation(engine, request);
}

export async function closeWorktreeOperation(
  engine: SpecFlowEngine,
  request: { readonly operationId: string; readonly specId: string },
): Promise<PublicCloseOperation> {
  const result = await closeWorktree(engine, request);
  if ('journal' in result) return projectCloseOperation(result.journal);
  const journal = await inspectCloseOperation(engine, request.operationId);
  if (!journal)
    throw new CloseOperationError('CLOSE_RECOVERY_REQUIRED', 'Close outcome journal is missing.');
  return projectCloseOperation(journal);
}

export async function closeSpecificationOperation(
  engine: SpecFlowEngine,
  request: {
    readonly operationId: string;
    readonly specId: string;
    readonly integrateToTargetBranch?: boolean;
  },
): Promise<PublicCloseOperation> {
  return projectCloseOperation((await closeSpecification(engine, request)).journal);
}

export async function reconcileArchivedConflictScratchOperation(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedNoActiveGitProcess: boolean,
): Promise<PublicCloseOperation> {
  return projectCloseOperation(
    await reconcileArchivedConflictScratch(engine, operationId, confirmedNoActiveGitProcess),
  );
}
