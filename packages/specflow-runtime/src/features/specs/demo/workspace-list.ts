import type {
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceUnavailableReason,
} from '@nevo/specflow-contracts/workspaces';

import type { DemoCatalogue } from '../../demo-catalogue';
import type { DemoState } from '../../../demo/state';
import { seededSpecWorkspace, type DemoRegistry, type DemoWorkspace } from './seed';

export interface DemoWorkspaceListDeps {
  /** The live demo workspace registry (the Create options without a scenario). */
  readonly registry: () => DemoRegistry;
  readonly catalogue: DemoCatalogue;
  readonly state: Pick<DemoState, 'specifications'>;
}

type BoundSpecification = WorkspaceListItem['specifications'][number];

/**
 * `GET /api/workspaces` over the demo registry. Like the Engine, a workspace lists the bound
 * Specifications only while it is available (an unavailable checkout's manifests cannot be read),
 * and `dirty` exists only for an available checkout on a branch (the demo project has Git on).
 */
export function createDemoWorkspaceList(deps: DemoWorkspaceListDeps): () => Promise<WorkspaceList> {
  return async () => {
    const registry = deps.registry();
    const bound = new Map<string, BoundSpecification[]>();
    for (const spec of await deps.catalogue.all()) {
      const workspaceId =
        deps.state.specifications.get(spec.id)?.workspaceId ?? seededSpecWorkspace(spec.id);
      bound.set(workspaceId, [
        ...(bound.get(workspaceId) ?? []),
        { specId: spec.id, title: spec.title },
      ]);
    }

    return {
      projectFolderId: registry.primaryWorkspaceId,
      workspaces: registry.workspaces.map((workspace) =>
        toListItem(workspace, registry.primaryWorkspaceId, bound),
      ),
    };
  };
}

function toListItem(
  workspace: DemoWorkspace,
  primaryWorkspaceId: string,
  bound: ReadonlyMap<string, BoundSpecification[]>,
): WorkspaceListItem {
  const common = {
    workspaceId: workspace.workspaceId,
    kind: workspace.kind,
    name: workspace.name,
    path: workspace.path,
    isRuntimeWorkspace: workspace.workspaceId === primaryWorkspaceId,
  };
  if (workspace.state === 'unavailable') {
    return {
      ...common,
      available: false,
      unavailableReason: unavailableReason(workspace),
      specifications: [],
    };
  }

  return {
    ...common,
    available: true,
    specifications: bound.get(workspace.workspaceId) ?? [],
    ...(workspace.branch !== undefined ? { dirty: workspace.state === 'dirty' } : {}),
  };
}

function unavailableReason(workspace: DemoWorkspace): WorkspaceUnavailableReason {
  return workspace.reason === 'git-unavailable' || workspace.reason === 'git-membership-mismatch'
    ? workspace.reason
    : 'checkout-unavailable';
}
