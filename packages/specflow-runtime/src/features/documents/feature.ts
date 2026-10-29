import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { OperationListConfig, OperationProgressRegistry } from '../operations';
import { createOperationProgressRegistry } from '../operations';
import type { RuntimeFeature } from '../runtime-feature';
import { documentContentEndpoint } from './content/endpoint';
import type { DocumentReadSource } from './content/document-read-source';
import { createEngineDocumentReadSource } from './content/engine-source';
import { rawDocumentEndpoint } from './content/raw-endpoint';
import { createEngineDocumentWriteSource } from './write/engine-write-source';
import { registerDocumentOperationList } from './write/operation-list';
import { documentWriteEndpoint } from './write/routes';
import type { DocumentWriteSource } from './write/write-source';

export interface DocumentsFeatureDependencies {
  /** Production composition: the Engine is the source of record. */
  engine?: SpecFlowEngine;
  /**
   * Explicit read source of the document tree, content and raw routes: the demo directories in demo
   * mode, a stub in tests. Wins over the Engine.
   */
  readSource?: DocumentReadSource;
  /**
   * Register the write routes and the document-operations list (default). The demo Runtime turns
   * them off: it serves the real read routes from its own data and emulates the writes under
   * `/api/demo/...`.
   */
  writeRoutes?: boolean;
  /** Explicit write source of the document write routes (tests). Wins over the Engine. */
  writeSource?: DocumentWriteSource;
  /** The document-operations list: the shared registry and the injectable clock and thresholds. */
  operations?: {
    registry?: OperationProgressRegistry;
    now?: () => Date;
    config?: Partial<OperationListConfig>;
  };
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
      if (dependencies.writeRoutes === false) return;
      // Writes and the list of document operations need the Engine; without it they are unavailable.
      const writeSource =
        dependencies.writeSource ??
        (dependencies.engine ? createEngineDocumentWriteSource(dependencies.engine) : undefined);
      app.register(documentWriteEndpoint, { source: writeSource });
      registerDocumentOperationList(app, {
        engine: dependencies.engine,
        registry: dependencies.operations?.registry ?? createOperationProgressRegistry(),
        ...(dependencies.operations?.config ? { config: dependencies.operations.config } : {}),
        ...(dependencies.operations?.now ? { now: dependencies.operations.now } : {}),
      });
    },
  };
}
