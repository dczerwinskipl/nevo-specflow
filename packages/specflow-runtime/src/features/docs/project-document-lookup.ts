import type { SpecificationCheckout } from '@nevo/specflow-engine';

import type { WorkspaceDocumentIds } from './feature';

/**
 * Whether the documentation of a Specification's checkout (its workspace or worktree, as the Engine
 * resolves it for `path` references) has an active document of this stable id, for the
 * `project-document` context entries of a Task. Same rule as the workspace's docs tree: a
 * deprecated, superseded or skipped document does not resolve. Each returned lookup asks once per
 * workspace, on its first call for it, so open one per request (the Engine's `openWorkflow`) to see
 * the documentation as it is now; a request without such a reference reads nothing.
 */
export function openProjectDocumentLookup(
  activeDocumentIds: WorkspaceDocumentIds,
): () => (checkout: SpecificationCheckout, id: string) => Promise<boolean> {
  return () => {
    const byWorkspace = new Map<string, Promise<ReadonlySet<string>>>();

    return async (checkout, id) => {
      let active = byWorkspace.get(checkout.workspaceId);
      if (active === undefined) {
        active = activeDocumentIds(checkout.workspaceId);
        byWorkspace.set(checkout.workspaceId, active);
      }

      return (await active).has(id);
    };
  };
}
