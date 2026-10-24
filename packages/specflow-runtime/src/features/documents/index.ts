export { createDocumentsFeature, type DocumentsFeatureDependencies } from './feature';
export type { DocumentContentSource } from './content/read-document';
export { createEngineDocumentContentSource } from './content/engine-source';
export { createDemoDocumentSource } from './demo/source';

export { buildDemoDocumentManifest } from './demo/contribution';
export { createDemoDocuments, type DemoDocuments } from './demo/operations';
export { registerDemoDocumentRoutes } from './demo/endpoints';
