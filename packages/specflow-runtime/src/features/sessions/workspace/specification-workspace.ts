import {
  inspectWorkspaceForRead,
  readRegistrySnapshot,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { SessionError } from '../errors';

/**
 * The verified root of the workspace a Specification lives in: its explicit registry binding (a
 * linked worktree) or, unbound, the primary checkout. A Session associated with the Specification
 * runs there; an unregistered or unavailable checkout refuses the Turn instead of falling back to
 * the Runtime's own folder.
 */
export function createSpecificationWorkspaceResolver(engine: SpecFlowEngine) {
  return async (specId: string): Promise<string> => {
    let inspected;
    try {
      const registry = await readRegistrySnapshot(engine);
      const workspaceId =
        registry.specBindings.find((binding) => binding.specId === specId)?.workspaceId ??
        registry.primaryWorkspaceId;
      inspected = await inspectWorkspaceForRead(engine, workspaceId);
    } catch {
      inspected = undefined;
    }

    if (inspected?.status !== 'available') {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        "The Specification's workspace is not available, so the agent cannot run in it. Restore or reopen its worktree, then try again.",
        { reason: 'specification-workspace-unavailable' },
      );
    }

    return inspected.root;
  };
}
