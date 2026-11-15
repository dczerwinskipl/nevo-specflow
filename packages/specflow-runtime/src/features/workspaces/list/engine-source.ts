import { inspectWorkspaces, type SpecFlowEngine } from '@nevo/specflow-engine';

import type { WorkspaceListSource } from './endpoint';

/** The project's workspace list from the Engine's shared inspection read (one per request). */
export function createEngineWorkspaceList(engine: SpecFlowEngine): WorkspaceListSource {
  return async () => {
    const inspected = await inspectWorkspaces(engine);
    const primary = inspected.find((workspace) => workspace.kind === 'primary');
    if (!primary) {
      throw new Error('The workspace registry has no primary workspace.');
    }

    return {
      projectFolderId: primary.workspaceId,
      workspaces: inspected.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        kind: workspace.kind,
        name: workspace.name,
        path: workspace.root,
        available: workspace.available,
        ...(workspace.unavailableReason !== undefined
          ? { unavailableReason: workspace.unavailableReason }
          : {}),
        isRuntimeWorkspace: workspace.isRuntimeWorkspace,
        // An unavailable checkout's manifests are not served, like the demo and the reference.
        specifications: workspace.available ? [...workspace.specifications] : [],
        // A detached checkout has no `git status` read: its cleanliness is unknown, not clean.
        ...(workspace.git && !workspace.git.detached ? { dirty: workspace.git.dirty } : {}),
      })),
    };
  };
}
