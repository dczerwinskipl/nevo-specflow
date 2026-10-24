import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import { documentContentEndpoint } from './content/endpoint';
import { createEngineDocumentContentSource } from './content/engine-source';
import type { DocumentContentSource } from './content/read-document';

export interface DocumentsFeatureDependencies {
  /** Explicit source (demo, tests). Wins over the Engine. */
  source?: DocumentContentSource;
  /** Production composition: the Engine is the source of record. */
  engine?: SpecFlowEngine;
}

export function createDocumentsFeature(
  dependencies: DocumentsFeatureDependencies = {},
): RuntimeFeature {
  // An absent source is an unavailable source, never synthetic content.
  const source =
    dependencies.source ??
    (dependencies.engine ? createEngineDocumentContentSource(dependencies.engine) : undefined);
  return {
    authorizationResources: [],
    register(app) {
      app.register(documentContentEndpoint, { source });
    },
  };
}
