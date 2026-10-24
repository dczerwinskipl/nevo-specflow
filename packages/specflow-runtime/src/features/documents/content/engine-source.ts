import {
  openSpecificationDocument,
  readSpecificationDocument,
  readSpecificationDocumentTree,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { DocumentContentSource } from './read-document';

/** The production document source: a thin pass-through to the Engine, which owns every rule. */
export function createEngineDocumentContentSource(engine: SpecFlowEngine): DocumentContentSource {
  return {
    read: (specId, documentId, revision) =>
      readSpecificationDocument(engine, specId, documentId, {
        ...(revision !== undefined ? { revision } : {}),
      }),
    readTree: (specId) => readSpecificationDocumentTree(engine, specId),
    open: (specId, documentId) => openSpecificationDocument(engine, specId, documentId),
  };
}
