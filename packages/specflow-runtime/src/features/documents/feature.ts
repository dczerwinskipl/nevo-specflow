import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import { documentContentEndpoint } from './content/endpoint';
import type { DocumentReadSource } from './content/document-read-source';
import { createEngineDocumentReadSource } from './content/engine-source';
import { rawDocumentEndpoint } from './content/raw-endpoint';

export interface DocumentsFeatureDependencies {
  /** Production composition: the Engine is the source of record. */
  engine?: SpecFlowEngine;
  /**
   * Explicit read source of the document tree, content and raw routes: the demo directories in demo
   * mode, a stub in tests. Wins over the Engine.
   */
  readSource?: DocumentReadSource;
}

export function createDocumentsFeature(
  dependencies: DocumentsFeatureDependencies = {},
): RuntimeFeature {
  return {
    authorizationResources: [],
    register(app) {
      // An absent source is an unavailable source, never synthetic content.
      const source =
        dependencies.readSource ??
        (dependencies.engine ? createEngineDocumentReadSource(dependencies.engine) : undefined);
      app.register(documentContentEndpoint, { source });
      app.register(rawDocumentEndpoint, { source });
    },
  };
}
