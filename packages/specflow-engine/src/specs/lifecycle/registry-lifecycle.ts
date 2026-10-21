import { isDeepStrictEqual } from 'node:util';

import { writeJsonAtomically } from '../../project/atomic-json';
import { withProjectControlLock } from '../../project/control-lock';
import type { ResolvedProjectHome } from '../../project/project-home';
import {
  WorkspaceRegistryError,
  readWorkspaceRegistry,
  validateWorkspaceRegistry,
  workspaceRegistryPath,
  type WorkspaceRegistry,
} from '../../project/workspace-registry';
import { assertSharedResourcesAvailable } from '../coordination/resources';
import type { CloseOccupant } from './model';

export interface LifecycleRegistryCAS {
  readonly operationId: string;
  readonly specId: string;
  readonly occupants?: readonly CloseOccupant[];
  readonly sourceWorkspaceId: string;
  readonly sourceInstanceId: string;
  readonly sourceRoot: string;
  readonly targetWorkspaceId: string;
  readonly targetRoot: string;
  readonly targetInstanceId?: string;
  readonly expectedBindingGeneration: number;
  readonly expectedRegistryRevision: number;
  readonly resources: readonly string[];
}

function conflict(message: string): WorkspaceRegistryError {
  return new WorkspaceRegistryError('REGISTRY_CONFLICT', message);
}
function assertOwnership(
  current: WorkspaceRegistry,
  claim: LifecycleRegistryCAS,
  afterRebind = false,
): void {
  const source = current.workspaces.find((w) => w.workspaceId === claim.sourceWorkspaceId);
  const destination = current.workspaces.find((w) => w.workspaceId === claim.targetWorkspaceId);
  if (
    !destination ||
    destination.workspaceId === claim.sourceWorkspaceId ||
    destination.root !== claim.targetRoot ||
    destination.instanceId !== claim.targetInstanceId ||
    source?.kind !== 'linked' ||
    !source.managed ||
    source.instanceId !== claim.sourceInstanceId ||
    source.root !== claim.sourceRoot
  )
    throw conflict('Lifecycle source is not an exclusively managed, pinned checkout.');
  const bound = current.specBindings
    .filter((x) => x.workspaceId === claim.sourceWorkspaceId)
    .sort((a, b) => a.specId.localeCompare(b.specId));
  if (afterRebind) {
    if (bound.length !== 0) throw conflict('Source still owns canonical Specifications.');
  } else if (!claim.occupants) {
    if (bound.length !== 1 || bound[0]?.specId !== claim.specId)
      throw conflict('Lifecycle source is not an exclusively bound checkout.');
  } else {
    if (
      bound.length !== claim.occupants.length ||
      bound.some(
        (entry, i) =>
          entry.specId !== claim.occupants![i]!.specId ||
          entry.generation !== claim.occupants![i]!.bindingGeneration,
      )
    )
      throw conflict('Workspace occupant set or generations changed.');
  }
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
    const affected = new Set(claim.occupants?.map((x) => x.specId) ?? [claim.specId]);
    await assertSharedResourcesAvailable(context, claim.resources, {
      kind: 'close',
      operationId: claim.operationId,
    });
    const next = validateWorkspaceRegistry(
      {
        ...current,
        revision: current.revision + 1,
        specBindings: current.specBindings.map((x) =>
          affected.has(x.specId)
            ? { ...x, workspaceId: claim.targetWorkspaceId, generation: current.revision + 1 }
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
    assertOwnership(current, claim, true);
    const ids = claim.occupants?.map((x) => x.specId) ?? [claim.specId];
    if (
      ids.some((specId) => {
        const bound = current.specBindings.find((x) => x.specId === specId);
        return (
          bound?.workspaceId !== claim.targetWorkspaceId || bound.generation !== reboundRevision
        );
      }) ||
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
