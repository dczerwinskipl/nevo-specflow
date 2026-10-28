import type {
  BatchSaveInput,
  BatchSaveResult,
  CreateDocumentsInput,
  DocumentOperationInput,
  DocumentOperationResult,
  DocumentOperationStatus,
  FlushInput,
  FlushResult,
  FolderInput,
  ManualCommitInput,
  ManualCommitResult,
  SaveInput,
  SaveResult,
  UncommittedView,
} from '@nevo/specflow-contracts/documents';

/**
 * What the document write routes need from the backend, in the shapes of the contract. The routes
 * authorize, bound the body and map failures; every document rule lives behind this port (the Engine).
 * Every method resolves the Specification itself: a Specification or an operation that is not the
 * caller's is `DOCUMENT_NOT_FOUND` / `DOCUMENT_OPERATION_NOT_FOUND`.
 */
export interface DocumentWriteSource {
  save(specId: string, documentId: string, input: SaveInput): Promise<SaveResult>;
  saveAll(specId: string, input: BatchSaveInput): Promise<BatchSaveResult>;
  create(specId: string, input: CreateDocumentsInput): Promise<DocumentOperationResult>;
  createFolder(specId: string, input: FolderInput): Promise<DocumentOperationResult>;
  /** rename, move, delete and classify of a document or a folder. */
  operate(specId: string, input: DocumentOperationInput): Promise<DocumentOperationResult>;
  status(specId: string, operationId: string): Promise<DocumentOperationStatus>;
  retry(specId: string, operationId: string): Promise<DocumentOperationStatus>;
  abandon(specId: string, operationId: string): Promise<DocumentOperationStatus>;
  flush(specId: string, input: FlushInput): Promise<FlushResult>;
  /** The uncommitted-changes ledger of the Specification, the commit policy and the open queue work (ADR 0018). */
  uncommitted(specId: string): Promise<UncommittedView>;
  /**
   * Commits exactly the ledger paths of the scope with the person's message (ADR 0018 decision 8):
   * synchronous, idempotent by `operationId`. Only the `specification` and `all` scopes exist here; the
   * definitions are the command line's.
   */
  commit(
    specId: string,
    input: ManualCommitInput,
    canManageSpecification: (specId: string) => boolean,
  ): Promise<ManualCommitResult>;
}
