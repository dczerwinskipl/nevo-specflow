import { runReadRequest } from './project/request-verification-memo';
import type { CheckoutQuiescence } from './specs/lifecycle/checkout-quiescence-port';
import type { SpecificationExitGuard } from './specs/lifecycle/exit-guard';
import type { AttemptCommitWait, FailedAttemptCommit } from './specs/uncommitted/attempts';
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
  /**
   * Whether a step of the Specification's run or of one of its Task runs is in progress (its finish
   * commits the execution state with automatic commits off). `undefined` when it cannot be told;
   * absent where no workflow is composed.
   */
  readonly stepInProgress?: (specId: string) => Promise<boolean | undefined>;
  /**
   * The finished agent attempts of a checkout whose commit failed, with the paths that commit holds
   * (D15): Close lists them under "retry the attempt commit". Absent where no workflow is composed.
   */
  readonly failedAttemptCommits?: (workspaceId: string) => Promise<readonly FailedAttemptCommit[]>;
  /**
   * With Git on, why the commit of the agent attempt `attemptId` still waits (D15): the owner's
   * Confirm is refused meanwhile. `undefined` once it ran, with Git off or for an unknown attempt.
   * Absent where no workflow is composed.
   */
  readonly attemptCommitWait?: (attemptId: string) => Promise<AttemptCommitWait | undefined>;
  /**
   * Whether an agent can work in a checkout Close would remove, from the host process (the Runtime
   * or the CLI) through `withCheckoutQuiescence`. Absent, Close does not remove a checkout.
   */
  readonly checkoutQuiescence?: CheckoutQuiescence;
}

/**
 * The ports one capability supplies to another through the opened Engine, so neither imports the
 * other; the composition root (`./engine`) supplies them.
 */
export interface EnginePorts {
  readonly specificationExit: (engine: SpecFlowEngine) => SpecificationExitGuard;
  readonly stepInProgress?: (
    engine: SpecFlowEngine,
  ) => (specId: string) => Promise<boolean | undefined>;
  readonly failedAttemptCommits?: (
    engine: SpecFlowEngine,
  ) => (workspaceId: string) => Promise<readonly FailedAttemptCommit[]>;
  readonly attemptCommitWait?: (
    engine: SpecFlowEngine,
  ) => (attemptId: string) => Promise<AttemptCommitWait | undefined>;
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
    ...(ports.stepInProgress
      ? { stepInProgress: (specId: string) => ports.stepInProgress!(engine)(specId) }
      : {}),
    ...(ports.failedAttemptCommits
      ? {
          failedAttemptCommits: (workspaceId: string) =>
            ports.failedAttemptCommits!(engine)(workspaceId),
        }
      : {}),
    ...(ports.attemptCommitWait
      ? {
          attemptCommitWait: (attemptId: string) => ports.attemptCommitWait!(engine)(attemptId),
        }
      : {}),
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
