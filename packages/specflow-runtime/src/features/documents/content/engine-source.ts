import {
  openSpecificationDocument,
  readSpecificationDocument,
  readSpecificationDocumentTree,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { DocumentReadSource } from './document-read-source';

/** The production document source: a thin pass-through to the Engine, which owns every rule. */
export function createEngineDocumentReadSource(engine: SpecFlowEngine): DocumentReadSource {
  return {
    read: (specId, documentId, revision) =>
      readSpecificationDocument(engine, specId, documentId, {
        ...(revision !== undefined ? { revision } : {}),
      }),
    readTree: (specId) => readSpecificationDocumentTree(engine, specId),
    open: (specId, documentId) => openSpecificationDocument(engine, specId, documentId),
  };
}
