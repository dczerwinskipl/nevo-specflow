import type { AgentAttemptDependencies, WorkflowDependencies } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { ProjectIdSource } from '../specs';
import { createEngineWorkflowPort } from './engine-port';
import type { WorkflowPort } from './port';
import { workflowEndpoint } from './routes';

export interface WorkflowFeatureDependencies {
  /**
   * The Engine's workflow operations, opened per request: over the Project Home (`openWorkflow`) in
   * a project Runtime, over the in-memory state in the demo Runtime.
   */
  readonly openWorkflow?: () => Promise<WorkflowDependencies>;
  /** The agent attempt operations over the Project Home (Retry commit); none in the demo Runtime. */
  readonly openAgentAttempts?: () => Promise<AgentAttemptDependencies>;
  /** Explicit backend (tests). Wins over the Engine. */
  readonly port?: WorkflowPort;
  readonly projectId?: ProjectIdSource;
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
      const port =
        dependencies.port ??
        (dependencies.openWorkflow
          ? createEngineWorkflowPort(dependencies.openWorkflow, dependencies.openAgentAttempts)
          : undefined);
      app.register(workflowEndpoint, {
        port,
        projectId: () => dependencies.projectId?.(),
      });
    },
  };
}
