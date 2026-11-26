import { ProjectGitCapabilities, SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { ProjectIdSource } from './scope';
import { defaultSpecsFeatureConfig, type SpecsFeatureConfig } from './configuration';
import { specsCreateEndpoint } from './create/endpoint';
import { registerSpecsOperationList } from './create/operation-list';
import {
  createFirstStep,
  firstStepIntentDirectory,
  type CreateFirstStep,
  type FirstStepStarter,
} from './create/first-step';
import { specsCloseEndpoint, type ReleaseWorkspace, type RunningSessions } from './close/endpoint';
import { specsOverviewEndpoint } from './overview/endpoint';
import type { SpecsOverviewRepository } from './overview/repository/read-repository';
import {
  createEngineSpecsOverviewRepository,
  type OverviewExecution,
} from './overview/repository/engine-repository';
import { specificationWorkspaceEndpoint } from './workspace/endpoint';
import { createEngineWorkspaceRepository } from './workspace/engine-repository';
import type {
  SpecificationWorkspaceRepository,
  WorkspaceContributions,
} from './workspace/repository';
import type { SessionReferenceOwner } from '../sessions';
import type { OperationEventsStreamOptions, OperationProgressRegistry } from '../operations';

export interface SpecsFeatureDependencies {
  readonly overviewRepository?: SpecsOverviewRepository;
  readonly engine?: SpecFlowEngine;
  readonly workspaceRepository?: SpecificationWorkspaceRepository;
  readonly contributions?: WorkspaceContributions;
  /** The workflow owner's execution facts of each listed Specification (project mode Overview). */
  readonly overviewExecution?: OverviewExecution;
  readonly sessions?: SessionReferenceOwner;
  /** The Runtime's project when there is no Engine to read it from (demo catalogue); see `specScope`. */
  readonly projectId?: ProjectIdSource;
  /** What the Runtime holds open in a checkout, released before Close may delete it (E9). */
  readonly releaseWorkspace?: ReleaseWorkspace;
  /** The Sessions whose Turn runs in a workspace now; Close refuses to remove such a checkout. */
  readonly runningSessions?: RunningSessions;
  /**
   * The agent start of Create's first-step intents (agent step execution). Absent: this Runtime
   * runs no agent and a Create with `firstStep` is refused.
   */
  readonly firstStepStarter?: FirstStepStarter;
  /** Replaces the first-step intent owner (tests). */
  readonly firstStep?: CreateFirstStep;
  /** Generic operation progress registry; absent disables live progress. */
  readonly progress?: {
    readonly registry: OperationProgressRegistry;
    readonly stream?: OperationEventsStreamOptions;
    readonly now?: () => Date;
    readonly staleAfterMs?: number;
  };
}

export interface CreateSpecsFeatureOptions {
  readonly config?: SpecsFeatureConfig;
  readonly dependencies?: SpecsFeatureDependencies;
}

export function createSpecsFeature(options: CreateSpecsFeatureOptions = {}): RuntimeFeature {
  // Demo data is available only through an explicit injected repository.
  // Production composition supplies the Engine; absent Engine is an unavailable
  // source, never a synthetic list of example specifications.
  const repository =
    options.dependencies?.overviewRepository ??
    (options.dependencies?.engine
      ? createEngineSpecsOverviewRepository(
          options.dependencies.engine,
          options.dependencies.overviewExecution,
        )
      : undefined);
  // Same rule for the workspace identity: an injected repository (demo) wins, the Engine is the
  // production source and its absence is an unavailable source.
  const workspaceRepository =
    options.dependencies?.workspaceRepository ??
    (options.dependencies?.engine
      ? createEngineWorkspaceRepository(options.dependencies.engine)
      : undefined);
  const config = options.config ?? defaultSpecsFeatureConfig();
  const projectId: ProjectIdSource = () =>
    options.dependencies?.projectId?.() ?? options.dependencies?.engine?.context.project.projectId;
  const engine = options.dependencies?.engine;
  const starter = options.dependencies?.firstStepStarter;
  const firstStep =
    options.dependencies?.firstStep ??
    (engine && starter
      ? createFirstStep({ starter, directory: () => firstStepIntentDirectory(engine) })
      : undefined);

  return {
    authorizationResources: [SpecCapabilities, ProjectGitCapabilities],
    register(app) {
      app.register(specsCreateEndpoint, {
        engine: options.dependencies?.engine,
        ...(firstStep ? { firstStep } : {}),
        projectId,
        ...(options.dependencies?.progress
          ? {
              progress: options.dependencies.progress.registry,
              ...(options.dependencies.progress.stream
                ? { stream: options.dependencies.progress.stream }
                : {}),
              ...(options.dependencies.progress.now
                ? { now: options.dependencies.progress.now }
                : {}),
              ...(options.dependencies.progress.staleAfterMs !== undefined
                ? { staleAfterMs: options.dependencies.progress.staleAfterMs }
                : {}),
            }
          : {}),
      });
      if (options.dependencies?.progress) {
        registerSpecsOperationList(app, {
          engine: options.dependencies.engine,
          firstStep,
          registry: options.dependencies.progress.registry,
          ...(options.dependencies.progress.now ? { now: options.dependencies.progress.now } : {}),
          ...(options.dependencies.progress.staleAfterMs !== undefined
            ? { config: { staleAfterMs: options.dependencies.progress.staleAfterMs } }
            : {}),
        });
      }

      app.register(specsCloseEndpoint, {
        engine: options.dependencies?.engine,
        ...(options.dependencies?.releaseWorkspace
          ? { releaseWorkspace: options.dependencies.releaseWorkspace }
          : {}),
        ...(options.dependencies?.runningSessions
          ? { runningSessions: options.dependencies.runningSessions }
          : {}),
      });
      app.register(specsOverviewEndpoint, {
        repository,
        currentSections: config.overview.current.sections,
        projectId,
      });
      app.register(specificationWorkspaceEndpoint, {
        repository: workspaceRepository,
        contributions: options.dependencies?.contributions,
        sessions: options.dependencies?.sessions,
        projectId,
      });
    },
  };
}
