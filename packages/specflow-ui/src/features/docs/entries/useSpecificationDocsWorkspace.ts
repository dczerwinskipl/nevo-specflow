import { useEffect } from 'react';
import { useSpecificationWorkspace } from '../../specs/read-model';
import { currentDocsWorkspace } from '../current-workspace/currentWorkspaceStore';

/**
 * Entering a Specification makes the workspace it is bound to the tab's current documentation
 * workspace; leaving it keeps that value until the next Specification or pick. `specId` is the
 * Specification the address names (`null` elsewhere). The tab's store is the external system this
 * synchronises with, once the Specification's workspace is known.
 */
export function useSpecificationDocsWorkspace(specId: string | null): void {
  const workspaceId = useSpecificationWorkspace(specId ?? '').data?.workspaceId;
  useEffect(() => {
    if (specId && workspaceId) {
      currentDocsWorkspace.enterSpecification(workspaceId);
    }
  }, [specId, workspaceId]);
}
