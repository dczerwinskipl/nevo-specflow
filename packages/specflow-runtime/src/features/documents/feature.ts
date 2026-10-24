import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import { documentContentEndpoint } from './content/endpoint';
import type { DocumentReadSource } from './content/document-read-source';
import { createEngineDocumentReadSource } from './content/engine-source';
import { legacyDocumentReadEndpoint } from './content/legacy-read-endpoint';
import { rawDocumentEndpoint } from './content/raw-endpoint';
import type { DocumentContentSource } from './content/read-document';

export interface DocumentsFeatureDependencies {
  /** Demo / injected legacy content source (the demonstration read shape). */
  source?: DocumentContentSource;
  /** Production composition: the Engine is the source of record. */
  engine?: SpecFlowEngine;
  /** Explicit read source of the document tree, content and raw routes (tests). Wins over the Engine. */
  readSource?: DocumentReadSource;
  /**
   * Serve the demonstration read route (legacy shape, only the document URL) instead of the tree,
   * content and raw routes. Set by the composition root in demo mode and for an injected legacy
   * source; the demo contract converges with the real one when the write operations land.
   */
  legacyDemoRead?: boolean;
}

export function createDocumentsFeature(
  dependencies: DocumentsFeatureDependencies = {},
): RuntimeFeature {
  return {
    authorizationResources: [],
    register(app) {
      if (dependencies.legacyDemoRead) {
        app.register(legacyDocumentReadEndpoint, { source: dependencies.source });
        return;
      }
      // An absent source is an unavailable source, never synthetic content.
      const source =
        dependencies.readSource ??
        (dependencies.engine ? createEngineDocumentReadSource(dependencies.engine) : undefined);
      app.register(documentContentEndpoint, { source });
      app.register(rawDocumentEndpoint, { source });
    },
  };
}
