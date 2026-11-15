import { runReadRequest } from './project/request-verification-memo';
import type { SpecificationExitGuard } from './specs/lifecycle/exit-guard';
import {
  resolveProjectHome,
  type ResolveProjectHomeOptions,
  type ResolvedProjectHome,
} from './project/home/home';
import {
  WorkspaceRegistryError,
  readWorkspaceRegistry,
  verifyWorkspaceRoot,
  type WorkspaceRegistration,
  type WorkspaceRegistry,
} from './project/workspace/registry/registry';

/** Offline application boundary shared by product CLI and Runtime. */
export interface SpecFlowEngine {
  readonly context: ResolvedProjectHome;
  readonly workspace: WorkspaceRegistration;
  readRegistry(): Promise<WorkspaceRegistry>;
  /** Close's Specification exit gate (D07), composed from the workflow capability. */
  readonly specificationExit: SpecificationExitGuard;
}

/**
 * The ports one capability supplies to another through the opened Engine, so neither imports the
 * other; the composition root (`./engine`) supplies them.
 */
export interface EnginePorts {
  readonly specificationExit: (engine: SpecFlowEngine) => SpecificationExitGuard;
}

/**
 * Read-only admission: never initialize or replace Project Home state implicitly. Use
 * `openSpecFlowEngine` (`./engine`), which supplies the ports.
 */
export async function openEngineBoundary(
  options: ResolveProjectHomeOptions,
  ports: EnginePorts,
): Promise<SpecFlowEngine> {
  const context = await resolveProjectHome(options);
  const registry = await readWorkspaceRegistry(context);
  const current = registry.workspaces.find((item) => item.root === context.workspace.root);
  if (!current) {
    throw new WorkspaceRegistryError(
      'REGISTRY_CONFLICT',
      'The current Git worktree is not registered with this Project Home.',
    );
  }

  await verifyWorkspaceRoot(context, current.root, current);
  const workspace = Object.freeze({ ...current });

  const engine: SpecFlowEngine = {
    context,
    workspace,
    specificationExit: (specId) => ports.specificationExit(engine)(specId),
    async readRegistry() {
      // Revalidate the physical checkout on each use, including linked
      // incarnation, rather than trusting the original open-time snapshot.
      const latest = await readWorkspaceRegistry(context);
      const registered = latest.workspaces.find(
        (item) => item.workspaceId === workspace.workspaceId && item.root === workspace.root,
      );
      if (!registered) {
        throw new WorkspaceRegistryError(
          'REGISTRY_CONFLICT',
          'The current workspace registration is no longer available.',
        );
      }

      await verifyWorkspaceRoot(context, registered.root, registered);

      return latest;
    },
  };

  return engine;
}

/**
 * READ-path registry snapshot: no Git process. Project Home identity is the one
 * verified when the Engine was opened; this only re-checks on-disk evidence.
 * Mutations must call `engine.readRegistry()` directly (full Git verification).
 */
export function readRegistrySnapshot(engine: SpecFlowEngine): Promise<WorkspaceRegistry> {
  return runReadRequest(() => engine.readRegistry());
}
