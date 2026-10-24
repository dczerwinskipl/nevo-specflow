export { createDocumentsFeature, type DocumentsFeatureDependencies } from './feature';
export type { DocumentContentSource } from './content/read-document';
export type { DocumentReadSource } from './content/document-read-source';
export { createEngineDocumentReadSource } from './content/engine-source';
export { createEngineWorkspaceDocuments } from './content/workspace-documents';
export { createDemoDocumentSource } from './demo/source';

export { buildDemoDocumentManifest } from './demo/contribution';
export { createDemoDocuments, type DemoDocuments } from './demo/operations';
export { registerDemoDocumentRoutes } from './demo/endpoints';
