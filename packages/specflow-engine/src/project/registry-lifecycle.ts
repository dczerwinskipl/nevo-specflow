import { isDeepStrictEqual } from 'node:util';

import { writeJsonAtomically } from './atomic-json';
import { withProjectControlLock } from './control-lock';
import type { ResolvedProjectHome } from './project-home';
import {
  WorkspaceRegistryError,
  readWorkspaceRegistry,
  validateWorkspaceRegistry,
  workspaceRegistryPath,
  type WorkspaceRegistry,
} from './workspace-registry';
import { assertSharedResourcesAvailable } from '../specs/coordination/resources';

export interface LifecycleRegistryCAS {
  readonly operationId: string;
  readonly specId: string;
  readonly sourceWorkspaceId: string;
  readonly sourceInstanceId: string;
  readonly sourceRoot: string;
  readonly primaryWorkspaceId: string;
  readonly expectedBindingGeneration: number;
  readonly expectedRegistryRevision: number;
  readonly resources: readonly string[];
}

function conflict(message: string): WorkspaceRegistryError {
  return new WorkspaceRegistryError('REGISTRY_CONFLICT', message);
}
function assertOwnership(current: WorkspaceRegistry, claim: LifecycleRegistryCAS): void {
  const source = current.workspaces.find((w) => w.workspaceId === claim.sourceWorkspaceId);
  if (
    source?.kind !== 'linked' ||
    !source.managed ||
    source.instanceId !== claim.sourceInstanceId ||
    source.root !== claim.sourceRoot ||
    current.primaryWorkspaceId !== claim.primaryWorkspaceId ||
    current.specBindings.filter((x) => x.workspaceId === claim.sourceWorkspaceId).length > 1
  )
    throw conflict('Lifecycle source is not an exclusively managed, pinned checkout.');
}

/** Narrow, separately coordinated binding CAS. Does NOT loosen the generic append-only port. */
export async function rebindLifecycleSpec(
  context: ResolvedProjectHome,
  claim: LifecycleRegistryCAS,
): Promise<WorkspaceRegistry> {
  return withProjectControlLock(context, async () => {
    const current = await readWorkspaceRegistry(context);
    if (current.revision !== claim.expectedRegistryRevision)
      throw conflict('Lifecycle registry snapshot changed.');
    assertOwnership(current, claim);
    const old = current.specBindings.find((x) => x.specId === claim.specId);
    if (
      old?.workspaceId !== claim.sourceWorkspaceId ||
      old.generation !== claim.expectedBindingGeneration
    )
      throw conflict('Lifecycle binding generation changed.');
    await assertSharedResourcesAvailable(context, claim.resources, {
      kind: 'close',
      operationId: claim.operationId,
    });
    const next = validateWorkspaceRegistry(
      {
        ...current,
        revision: current.revision + 1,
        specBindings: current.specBindings.map((x) =>
          x.specId === claim.specId
            ? { ...x, workspaceId: claim.primaryWorkspaceId, generation: current.revision + 1 }
            : x,
        ),
      },
      context,
    );
    if (isDeepStrictEqual(next, current)) throw conflict('Lifecycle binding CAS was a no-op.');
    await writeJsonAtomically(workspaceRegistryPath(context), next);
    return readWorkspaceRegistry(context);
  });
}

/** Narrow second CAS, only after physical non-force Git removal was independently proved. */
export async function retireLifecycleWorkspace(
  context: ResolvedProjectHome,
  claim: LifecycleRegistryCAS,
  reboundRevision: number,
): Promise<WorkspaceRegistry> {
  return withProjectControlLock(context, async () => {
    const current = await readWorkspaceRegistry(context);
    if (current.revision !== reboundRevision) throw conflict('Post-rebind registry changed.');
    assertOwnership(current, claim);
    const bound = current.specBindings.find((x) => x.specId === claim.specId);
    if (
      bound?.workspaceId !== claim.primaryWorkspaceId ||
      bound.generation !== reboundRevision ||
      current.specBindings.some((x) => x.workspaceId === claim.sourceWorkspaceId)
    )
      throw conflict('Source workspace still owns a binding.');
    await assertSharedResourcesAvailable(context, claim.resources, {
      kind: 'close',
      operationId: claim.operationId,
    });
    const next = validateWorkspaceRegistry(
      {
        ...current,
        revision: current.revision + 1,
        workspaces: current.workspaces.filter((x) => x.workspaceId !== claim.sourceWorkspaceId),
      },
      context,
    );
    await writeJsonAtomically(workspaceRegistryPath(context), next);
    return readWorkspaceRegistry(context);
  });
}
