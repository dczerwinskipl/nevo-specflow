import { inspectWorkspaceForRead, type SpecFlowEngine } from '@nevo/specflow-engine';

import type { ResolveWorkspace } from './workspace-corpora';

/**
 * C5: every request resolves its workspace through the Engine's read path. The registry's reason of
 * an unavailable checkout is dropped here, so it can reach no response.
 */
export function engineWorkspaceResolver(engine: SpecFlowEngine): ResolveWorkspace {
  return async (workspaceId) => {
    const inspected = await inspectWorkspaceForRead(engine, workspaceId);
    switch (inspected.status) {
      case 'available':
        return {
          status: 'available',
          root: inspected.root,
          projectHome: inspected.workspace.kind === 'primary',
        };
      case 'unavailable':
      case 'not-registered':
        return { status: inspected.status };
    }
  };
}
