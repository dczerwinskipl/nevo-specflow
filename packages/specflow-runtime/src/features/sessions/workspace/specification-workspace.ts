import {
  closeInProgress,
  inspectWorkspaceForRead,
  readRegistrySnapshot,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { SessionError } from '../errors';
import { recordedIdentity } from '../effects/engine';

/** A Specification's verified workspace: its registered root and the identity a claim records. */
export interface SpecificationWorkspace {
  readonly root: string;
  readonly workspaceId: string;
  readonly workspaceIdentity: string;
}

/**
 * The verified workspace a Specification lives in: its explicit registry binding (a linked
 * worktree) or, unbound, the primary checkout. A Session associated with the Specification runs
 * there; an unregistered or unavailable checkout, or a Specification an unfinished Close holds (its
 * checkout may be removed), refuses the Turn instead of falling back to the Runtime's own folder.
 */
export function createSpecificationWorkspaceResolver(engine: SpecFlowEngine) {
  return async (specId: string): Promise<SpecificationWorkspace> => {
    let inspected;
    let closing = false;
    try {
      const registry = await readRegistrySnapshot(engine);
      const workspaceId =
        registry.specBindings.find((binding) => binding.specId === specId)?.workspaceId ??
        registry.primaryWorkspaceId;
      inspected = await inspectWorkspaceForRead(engine, workspaceId);
      closing = await closeInProgress(engine, specId);
    } catch {
      inspected = undefined;
    }

    if (closing) {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        'The Specification is being closed, so no agent can start in its workspace.',
        { reason: 'specification-close-in-progress' },
      );
    }

    if (inspected?.status !== 'available') {
      throw new SessionError(
        'CAPABILITY_UNSUPPORTED',
        "The Specification's workspace is not available, so the agent cannot run in it. Restore or reopen its worktree, then try again.",
        { reason: 'specification-workspace-unavailable' },
      );
    }

    // The registered root, as an execution claim names it (the claim is matched by root).
    return {
      root: inspected.workspace.root,
      workspaceId: inspected.workspace.workspaceId,
      workspaceIdentity: recordedIdentity(engine, inspected.workspace),
    };
  };
}
