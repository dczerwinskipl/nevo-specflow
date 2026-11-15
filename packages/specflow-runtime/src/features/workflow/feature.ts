import type { SpecFlowEngine, WorkflowDependencies } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { ProjectIdSource } from '../specs';
import { createEngineWorkflowPort } from './engine-port';
import type { WorkflowPort } from './port';
import { workflowEndpoint } from './routes';

export interface WorkflowFeatureDependencies {
  /** Production composition: the Engine is the source of record. */
  readonly engine?: SpecFlowEngine;
  /** The workflow operations of the Engine, opened per request (default: `openWorkflow(engine)`). */
  readonly openWorkflow?: () => Promise<WorkflowDependencies>;
  /** Explicit backend (tests). Wins over the Engine. */
  readonly port?: WorkflowPort;
  readonly projectId?: ProjectIdSource;
  /** Register the routes (default). The demo Runtime turns them off: it has no Engine. */
  readonly routes?: boolean;
}

/**
 * The workflow action routes of Specifications and Tasks. Without a backend a route answers 503
 * `WORKFLOW_UNAVAILABLE`.
 */
export function createWorkflowFeature(
  dependencies: WorkflowFeatureDependencies = {},
): RuntimeFeature {
  return {
    authorizationResources: [],
    register(app) {
      if (dependencies.routes === false) {
        return;
      }

      const port =
        dependencies.port ??
        (dependencies.engine
          ? createEngineWorkflowPort(dependencies.engine, dependencies.openWorkflow)
          : undefined);
      app.register(workflowEndpoint, {
        port,
        projectId: () =>
          dependencies.projectId?.() ?? dependencies.engine?.context.project.projectId,
      });
    },
  };
}
