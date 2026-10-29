import {
  abandonDocumentCommit,
  applyDocumentChange,
  flushAllDocumentCommits,
  flushDocumentCommits,
  readDocumentOperationStatus,
  readSpecificationDocumentTree,
  recoverOperation,
  resolveCreateArchetype,
  resolveLedgerOperation,
  resolveSpecificationForRead,
  retryDocumentCommit,
  takeOverDocumentQueue,
  type DocumentChangeResult,
  type DocumentQueueTakeoverResult,
  type FlushAllOutcome,
  type FlushOutcome,
  type RecoverMode,
  type ResolveLedgerResult,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import { engineAt } from '../engine-at';

/** The tree and the operation status as the Engine reads them (the HTTP contract shapes). */
export type DocumentTree = Awaited<ReturnType<typeof readSpecificationDocumentTree>>;
export type DocumentOperationStatus = Awaited<ReturnType<typeof readDocumentOperationStatus>>;

/** A write the CLI makes: the request of one Engine document change. */
export type DocumentWriteRequest = Parameters<typeof applyDocumentChange>[3];

/** The checkout whose commit queue a flush serves. */
export interface DocumentCheckout {
  readonly workspaceId: string;
  readonly root: string;
}

/**
 * Every Engine capability the document commands use. The commands depend on this interface only, so a
 * command test can run against a stub and the real binding is one object (below).
 */
export interface DocumentsEngineApi {
  openEngine(cwd: string, projectRoot?: string): Promise<SpecFlowEngine>;
  readTree(engine: SpecFlowEngine, specId: string): Promise<DocumentTree>;
  write(
    engine: SpecFlowEngine,
    specId: string,
    operationId: string,
    request: DocumentWriteRequest,
  ): Promise<DocumentChangeResult>;
  status(engine: SpecFlowEngine, operationId: string): Promise<DocumentOperationStatus>;
  checkoutOf(engine: SpecFlowEngine, specId: string): Promise<DocumentCheckout>;
  /** The current catalogue revision for the archetype of a Specification. */
  catalogueRevisionFor(engine: SpecFlowEngine, archetypeId: string): Promise<string>;
  flushCheckout(
    engine: SpecFlowEngine,
    checkout: DocumentCheckout,
    waitCapMs?: number,
  ): Promise<FlushOutcome>;
  flushAll(engine: SpecFlowEngine, deadlineMs: number): Promise<FlushAllOutcome>;
  retry(engine: SpecFlowEngine, operationId: string): Promise<unknown>;
  abandon(engine: SpecFlowEngine, operationId: string): Promise<unknown>;
  recover(
    engine: SpecFlowEngine,
    operationId: string,
    mode: RecoverMode,
    confirmExecutorStopped: boolean,
  ): Promise<unknown>;
  takeOver(engine: SpecFlowEngine): Promise<DocumentQueueTakeoverResult>;
  /** Drops the ledger entries of an operation that a person dealt with by hand (see `resolveLedgerOperation`). */
  resolve(engine: SpecFlowEngine, operationId: string): Promise<ResolveLedgerResult>;
}

/** The binding to the Engine of this installation. */
export const engineDocumentsApi: DocumentsEngineApi = {
  openEngine: engineAt,
  readTree: (engine, specId) => readSpecificationDocumentTree(engine, specId),
  write: (engine, specId, operationId, request) =>
    applyDocumentChange(engine, specId, operationId, request),
  status: (engine, operationId) => readDocumentOperationStatus(engine, operationId),
  async checkoutOf(engine, specId) {
    const found = await resolveSpecificationForRead(engine, specId);
    if (found.status !== 'available') {
      throw new Error(`Specification ${specId} is not available (${found.status}).`);
    }

    return { workspaceId: found.workspaceId, root: found.workspaceRoot };
  },
  async catalogueRevisionFor(engine, archetypeId) {
    return (await resolveCreateArchetype(engine, archetypeId)).catalogueRevision;
  },
  flushCheckout: (engine, checkout, waitCapMs) =>
    flushDocumentCommits(engine, checkout, waitCapMs !== undefined ? { waitCapMs } : {}),
  flushAll: (engine, deadlineMs) => flushAllDocumentCommits(engine, { deadlineMs }),
  retry: (engine, operationId) => retryDocumentCommit(engine, operationId),
  abandon: (engine, operationId) => abandonDocumentCommit(engine, operationId),
  // A manual commit and a document operation are recovered through one entry: the Engine knows which it is.
  recover: (engine, operationId, mode, confirmExecutorStopped) =>
    recoverOperation(engine, operationId, mode, {
      ...(confirmExecutorStopped ? { confirmExecutorStopped: true } : {}),
    }),
  takeOver: (engine) => takeOverDocumentQueue(engine, { confirmExecutorStopped: true }),
  resolve: (engine, operationId) => resolveLedgerOperation(engine, operationId),
};
