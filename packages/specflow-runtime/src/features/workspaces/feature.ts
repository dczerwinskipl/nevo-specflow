import type { SpecFlowEngine } from '@nevo/specflow-engine';
import { WorkspaceCapabilities } from '@nevo/specflow-contracts/workspaces';

import type { RuntimeFeature } from '../runtime-feature';
import type { ProjectIdSource } from '../specs';
import { createEngineWorkspaceList } from './list/engine-source';
import { workspaceListEndpoint, type WorkspaceListSource } from './list/endpoint';

export interface CreateWorkspacesFeatureOptions {
  /** Project mode: the list is read from the Engine. */
  readonly engine?: SpecFlowEngine;
  /** An injected list (the demo workspace registry) wins over the Engine. */
  readonly source?: WorkspaceListSource;
  /** The Runtime's project, the scope of `workspace.view`. */
  readonly projectId: ProjectIdSource;
}

/** The project's registered workspaces, shared by the documentation reader and Create. */
export function createWorkspacesFeature(options: CreateWorkspacesFeatureOptions): RuntimeFeature {
  const source =
    options.source ?? (options.engine ? createEngineWorkspaceList(options.engine) : undefined);

  return {
    authorizationResources: [WorkspaceCapabilities],
    register(app) {
      app.register(workspaceListEndpoint, {
        ...(source ? { source } : {}),
        projectId: options.projectId,
      });
    },
  };
}
