import type {
  CreateDocumentsInput,
  DocumentContent,
  DocumentOperationInput,
  DocumentOperationResult,
  SaveInput,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import type { TaskDocumentTree } from '@nevo/specflow-contracts/tasks';
import {
  applyTaskDocumentChange,
  normalizeDocumentOperationInput,
  readTaskDocument,
  readTaskDocuments,
  type DocumentChangeResult,
  type DocumentWriteOptions,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { createRequestOf, savedDocument, written } from '../write/engine-write-source';

/**
 * The documents of one Task (Task-scoped Documents): its registry in `task.yaml` and the files of
 * its folder. Every rule (paths, revisions, the undeletable `task.md`, pending changes of the Task
 * resource) is the Engine's; a Task its Specification does not list is `DOCUMENT_NOT_FOUND`.
 */
export interface TaskDocumentSource {
  tree(specId: string, taskId: string): Promise<TaskDocumentTree>;
  read(
    specId: string,
    taskId: string,
    documentId: string,
    revision?: string,
  ): Promise<DocumentContent>;
  save(specId: string, taskId: string, documentId: string, input: SaveInput): Promise<SaveResult>;
  create(
    specId: string,
    taskId: string,
    input: CreateDocumentsInput,
  ): Promise<DocumentOperationResult>;
  /** rename, move and delete of a Task document. */
  operate(
    specId: string,
    taskId: string,
    input: DocumentOperationInput,
  ): Promise<DocumentOperationResult>;
}

/** The production source: a thin pass-through to the Engine. */
export function createEngineTaskDocumentSource(
  engine: SpecFlowEngine,
  options: { readonly write?: DocumentWriteOptions } = {},
): TaskDocumentSource {
  const tree = async (specId: string, taskId: string): Promise<TaskDocumentTree> => {
    const listing = await readTaskDocuments(engine, specId, taskId);

    return {
      taskId: listing.taskId,
      registryRevision: listing.registryRevision,
      writable: listing.writable,
      documents: listing.documents.map((document) => ({
        id: document.id,
        path: document.path,
        ...(document.type !== undefined ? { type: document.type } : {}),
        classification: document.classification,
        required: document.required,
        ...(document.file ? { file: { ...document.file } } : {}),
      })),
    };
  };

  const operationResult = async (
    specId: string,
    taskId: string,
    result: DocumentChangeResult,
  ): Promise<DocumentOperationResult> => ({
    operationId: result.operationId,
    // The registry revision after the write (the Task's `document-tree` reports the same value).
    revision: (await tree(specId, taskId)).registryRevision,
    documents: written(result),
    removedDocumentIds: [...result.removedDocumentIds],
    folders: [...result.folders],
    commit: result.commit,
  });

  return {
    tree,
    read: (specId, taskId, documentId, revision) =>
      readTaskDocument(engine, specId, taskId, documentId, {
        ...(revision !== undefined ? { revision } : {}),
      }),
    async save(specId, taskId, documentId, input) {
      const result = await applyTaskDocumentChange(
        engine,
        specId,
        taskId,
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
    async create(specId, taskId, input) {
      return operationResult(
        specId,
        taskId,
        await applyTaskDocumentChange(
          engine,
          specId,
          taskId,
          input.operationId,
          createRequestOf(input),
          options.write,
        ),
      );
    },
    async operate(specId, taskId, input) {
      return operationResult(
        specId,
        taskId,
        await applyTaskDocumentChange(
          engine,
          specId,
          taskId,
          input.operationId,
          normalizeDocumentOperationInput(input),
          options.write,
        ),
      );
    },
  };
}
