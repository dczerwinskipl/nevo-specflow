import type { SpecFlowEngine } from '../../../application';
import {
  inspectRegisteredWorkspace,
  type WorkspaceIntegrationDestination,
} from '../../../project/workspace-registry';
import { CreateOperationError } from '../error';
import { inspectCleanGitWorkspace } from '../../lifecycle/preflight';

export interface ExplicitIntegrationPreflight {
  readonly registryRevision: number;
  readonly destination: WorkspaceIntegrationDestination;
}

/**
 * Git/physical checkout preflight is deliberately outside Create's short
 * Project Home control lock. A registry CAS fences concurrent replacement.
 */
export async function inspectExplicitIntegrationDestination(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<ExplicitIntegrationPreflight> {
  const registry = await engine.readRegistry();
  const registration = registry.workspaces.find((item) => item.workspaceId === workspaceId);
  if (!registration || (registration.kind === 'linked' && !registration.managed)) {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'Integration destination must be a registered managed or primary checkout.',
    );
  }
  const inspected = await inspectRegisteredWorkspace(engine.context, registry, workspaceId);
  if (inspected.status !== 'available') {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'Selected integration checkout is unavailable.',
    );
  }
  const physical = await inspectCleanGitWorkspace(registration).catch(() => {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'Integration destination must have an attached, clean local branch.',
    );
  });
  return {
    registryRevision: registry.revision,
    destination: {
      workspaceId,
      branch: physical.branch,
      ...(registration.instanceId ? { instanceId: registration.instanceId } : {}),
    },
  };
}
