import type {
  ActionProjection,
  AgentAttemptDependencies,
  WorkflowDependencies,
  WorkflowSubject,
} from '@nevo/specflow-engine';

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
  /**
   * What only the Runtime knows of the agent option (Ask agent): its reasons and the active agent
   * attempt, added to every projection the actions route serves.
   */
  readonly agentAvailability?: (
    subject: WorkflowSubject,
    projection: ActionProjection,
  ) => Promise<ActionProjection>;
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
      const base =
        dependencies.port ??
        (dependencies.openWorkflow
          ? createEngineWorkflowPort(dependencies.openWorkflow, dependencies.openAgentAttempts)
          : undefined);
      const availability = dependencies.agentAvailability;
      const port: WorkflowPort | undefined =
        base && availability
          ? {
              ...base,
              actions: async (subject) => availability(subject, await base.actions(subject)),
            }
          : base;
      app.register(workflowEndpoint, {
        port,
        projectId: () => dependencies.projectId?.(),
      });
    },
  };
}
