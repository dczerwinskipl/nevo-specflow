export { createDocumentsFeature, type DocumentsFeatureDependencies } from './feature';
export { documentFailure, type DocumentFailure } from './content/error-status';
export type { DocumentReadSource } from './content/document-read-source';
export { createEngineDocumentReadSource } from './content/engine-source';
export { createEngineWorkspaceDocuments } from './content/workspace-documents';
export { statusForDocumentError } from './content/error-status';

export { createDemoDocuments, type DemoDocuments } from './demo/operations';
export { createDemoDocumentReadSource } from './demo/read-source';
export { registerDemoDocumentRoutes } from './demo/endpoints';
export type { DemoSpecDocuments } from './demo/model';
