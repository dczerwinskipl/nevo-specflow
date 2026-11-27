export { createDocumentsFeature, type DocumentsFeatureDependencies } from './feature';
export { documentFailure, type DocumentFailure } from './content/error-status';
export type { DocumentReadSource } from './content/document-read-source';
export { createEngineDocumentReadSource } from './content/engine-source';
export { createEngineWorkspaceDocuments } from './content/workspace-documents';
// The agent broker calls the same Engine write use cases as the routes, as a Turn's owned execution.
export {
  createEngineDocumentWriteSource,
  type EngineDocumentWriteOptions,
} from './write/engine-write-source';
export { createEngineTaskDocumentSource } from './task/task-document-source';
export { statusForDocumentError } from './content/error-status';

export { createDemoDocuments, type DemoDocuments } from './demo/operations';
export { createDemoDocumentReadSource } from './demo/read-source';
export { registerDemoDocumentRoutes } from './demo/endpoints';
export type { DemoSpecDocuments } from './demo/model';
export {
  createDemoTaskDocuments,
  type DemoTaskDocuments,
  type DemoTaskDocumentState,
} from './demo/task-documents';
