import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { OperationListConfig, OperationProgressRegistry } from '../operations';
import { createOperationProgressRegistry } from '../operations';
import type { RuntimeFeature } from '../runtime-feature';
import type { ProjectIdSource } from '../specs';
import { documentContentEndpoint } from './content/endpoint';
import type { DocumentReadSource } from './content/document-read-source';
import { createEngineDocumentReadSource } from './content/engine-source';
import { rawDocumentEndpoint } from './content/raw-endpoint';
import { createEngineDocumentWriteSource } from './write/engine-write-source';
import { registerDocumentOperationList } from './write/operation-list';
import { documentWriteEndpoint } from './write/routes';
import type { DocumentWriteSource } from './write/write-source';
import { taskDocumentRoutes } from './task/routes';
import {
  createEngineTaskDocumentSource,
  type TaskDocumentSource,
} from './task/task-document-source';

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
  /** Explicit source of the Task document routes (tests). Wins over the Engine. */
  taskDocuments?: TaskDocumentSource;
  /** The Runtime's project when there is no Engine to read it from (demo); see `specScope`. */
  projectId?: ProjectIdSource;
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
      const projectId: ProjectIdSource = () =>
        dependencies.projectId?.() ?? dependencies.engine?.context.project.projectId;
      app.register(documentContentEndpoint, { source, projectId });
      app.register(rawDocumentEndpoint, { source, projectId });
      if (dependencies.writeRoutes === false) {
        return;
      }

      // Writes and the list of document operations need the Engine; without it they are unavailable.
      const writeSource =
        dependencies.writeSource ??
        (dependencies.engine ? createEngineDocumentWriteSource(dependencies.engine) : undefined);
      app.register(documentWriteEndpoint, {
        source: writeSource,
        projectId,
      });
      // The documents of a Task: project mode only, like the Specification writes.
      const taskDocuments =
        dependencies.taskDocuments ??
        (dependencies.engine ? createEngineTaskDocumentSource(dependencies.engine) : undefined);
      app.register(taskDocumentRoutes, {
        ...(taskDocuments ? { source: taskDocuments } : {}),
        projectId,
      });
      registerDocumentOperationList(app, {
        engine: dependencies.engine,
        registry: dependencies.operations?.registry ?? createOperationProgressRegistry(),
        ...(dependencies.operations?.config ? { config: dependencies.operations.config } : {}),
        ...(dependencies.operations?.now ? { now: dependencies.operations.now } : {}),
      });
    },
  };
}
