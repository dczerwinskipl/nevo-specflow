import type {
  DocumentOperationResult,
  DocumentOperationStatus,
  FlushResult,
  ManualCommitResult,
  WrittenDocument,
} from '@nevo/specflow-contracts/documents';
import {
  DocumentError,
  abandonDocumentCommit,
  applyDocumentChange,
  flushDocumentCommits,
  manualCommit,
  normalizeDocumentOperationInput,
  readDocumentOperationStatus,
  readSpecificationDocumentTree,
  readSpecificationUncommitted,
  resolveSpecificationForRead,
  retryDocumentCommit,
  type DocumentChangeResult,
  type DocumentWriteOptions,
  type ManualCommitCommandOptions,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { DocumentWriteSource } from './write-source';

export interface EngineDocumentWriteOptions {
  /** Seams of the writer (tests): commit port, clock, file operations. Never set by a transport. */
  readonly write?: DocumentWriteOptions;
  /** Seams of the flush (tests). */
  readonly flush?: Parameters<typeof flushDocumentCommits>[2];
  /** Seams of retry and abandon (tests). */
  readonly queue?: Parameters<typeof retryDocumentCommit>[2];
  /**
   * Seams of the manual commit (tests): the commit port, the clock, the hooks. Never set by a transport;
   * the operator's assertions (`confirmExecutorStopped`) and the definitions scope are not accepted here.
   */
  readonly manualCommit?: Pick<
    ManualCommitCommandOptions,
    'deps' | 'queue' | 'commitDeadlineMs' | 'flushWaitMs'
  >;
}

function written(result: DocumentChangeResult): WrittenDocument[] {
  return result.documents.map((document) => ({
    id: document.id,
    path: document.path,
    revision: document.sha256,
    ...(document.type !== undefined ? { type: document.type } : {}),
  }));
}

/** The documents of a result that must name exactly the document that was saved. */
function savedDocument(result: DocumentChangeResult): WrittenDocument {
  const [document] = written(result);
  // A save that wrote no document is a defect of the Engine, never a client error.
  if (!document) throw new Error('The save reported no document.');
  return document;
}

/** The production write source: a thin pass-through to the Engine, which owns every rule. */
export function createEngineDocumentWriteSource(
  engine: SpecFlowEngine,
  options: EngineDocumentWriteOptions = {},
): DocumentWriteSource {
  const operationResult = async (
    specId: string,
    result: DocumentChangeResult,
  ): Promise<DocumentOperationResult> => ({
    operationId: result.operationId,
    // The tree revision after the write: the next read answers 304 against it.
    revision: (await readSpecificationDocumentTree(engine, specId)).revision,
    documents: written(result),
    removedDocumentIds: [...result.removedDocumentIds],
    folders: [...result.folders],
    commit: result.commit,
  });

  /** An operation of another Specification does not exist for the caller. */
  const inSpecification = (specId: string, operationId: string) =>
    readDocumentOperationStatus(engine, operationId, { specId });

  return {
    async save(specId, documentId, input) {
      const result = await applyDocumentChange(
        engine,
        specId,
        input.operationId,
        {
          action: 'save',
          documentId,
          content: input.content,
          expectedRevision: input.expectedRevision,
        },
        options.write,
      );
      return {
        operationId: result.operationId,
        document: savedDocument(result),
        commit: result.commit,
      };
    },

    async saveAll(specId, input) {
      const result = await applyDocumentChange(
        engine,
        specId,
        input.operationId,
        { action: 'save-all', documents: input.documents },
        options.write,
      );
      return {
        operationId: result.operationId,
        documents: written(result),
        commit: result.commit,
      };
    },

    async create(specId, input) {
      // A template entry is rendered by the Engine from the project catalogue; nothing is guessed here.
      const documents = input.documents.map((entry) =>
        'templateId' in entry
          ? {
              path: entry.path,
              templateId: entry.templateId,
              ...(entry.type !== undefined ? { type: entry.type } : {}),
            }
          : {
              path: entry.path,
              content: entry.content,
              ...(entry.type !== undefined ? { type: entry.type } : {}),
            },
      );
      return operationResult(
        specId,
        await applyDocumentChange(
          engine,
          specId,
          input.operationId,
          {
            action: 'create',
            documents,
            folders: input.folders ?? [],
            ...(input.catalogueRevision !== undefined
              ? { catalogueRevision: input.catalogueRevision }
              : {}),
          },
          options.write,
        ),
      );
    },

    async createFolder(specId, input) {
      return operationResult(
        specId,
        await applyDocumentChange(
          engine,
          specId,
          input.operationId,
          { action: 'folder', path: input.path },
          options.write,
        ),
      );
    },

    async operate(specId, input) {
      return operationResult(
        specId,
        await applyDocumentChange(
          engine,
          specId,
          input.operationId,
          normalizeDocumentOperationInput(input),
          options.write,
        ),
      );
    },

    status: (specId, operationId) => inSpecification(specId, operationId),

    uncommitted: (specId) => readSpecificationUncommitted(engine, specId),

    async commit(specId, input, canManageSpecification): Promise<ManualCommitResult> {
      // The scope `definitions` and the operator's assertion that an executor stopped never come from HTTP.
      const result = await manualCommit(
        engine,
        {
          operationId: input.operationId,
          scope: input.scope ?? 'specification',
          specId,
          ...(input.message !== undefined ? { message: input.message } : {}),
          ...(input.paths !== undefined ? { paths: input.paths } : {}),
          ...(input.ledgerRevision !== undefined ? { ledgerRevision: input.ledgerRevision } : {}),
        },
        { ...options.manualCommit, allowDefinitions: false, canManageSpecification },
      );
      return {
        operationId: result.operationId,
        commit: result.commit,
        paths: [...result.paths],
        remaining: result.remaining,
      };
    },

    async retry(specId, operationId): Promise<DocumentOperationStatus> {
      await inSpecification(specId, operationId);
      await retryDocumentCommit(engine, operationId, options.queue);
      return inSpecification(specId, operationId);
    },

    async abandon(specId, operationId): Promise<DocumentOperationStatus> {
      await inSpecification(specId, operationId);
      await abandonDocumentCommit(engine, operationId, options.queue);
      return inSpecification(specId, operationId);
    },

    async flush(specId, input): Promise<FlushResult> {
      const specification = await resolveSpecificationForRead(engine, specId);
      if (specification.status !== 'available') {
        throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Specification is not available.');
      }
      const before = await unsettledOf(engine, specId);
      await flushDocumentCommits(
        engine,
        { workspaceId: specification.workspaceId, root: specification.workspaceRoot },
        {
          ...options.flush,
          ...(input.waitMs !== undefined ? { waitCapMs: input.waitMs } : {}),
        },
      );
      const after = await unsettledOf(engine, specId);
      return {
        settled: after.pending === 0,
        pending: after.pending,
        failed: after.failed,
        // Operations of this Specification that left the unsettled set: committed or nothing to commit.
        committed: Math.max(0, before.pending + before.failed - (after.pending + after.failed)),
      };
    },
  };
}

/** The operations of one Specification that have not settled, from the journals (no Git). */
async function unsettledOf(
  engine: SpecFlowEngine,
  specId: string,
): Promise<{ pending: number; failed: number }> {
  const commits = (await readSpecificationDocumentTree(engine, specId)).commits;
  return { pending: commits?.pending ?? 0, failed: commits?.failed ?? 0 };
}
