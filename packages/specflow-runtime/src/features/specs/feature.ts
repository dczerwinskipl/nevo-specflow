import { ProjectGitCapabilities, SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import { defaultSpecsFeatureConfig, type SpecsFeatureConfig } from './configuration';
import { specsCreateEndpoint } from './create/endpoint';
import { registerSpecsOperationList } from './create/operation-list';
import { specsCloseEndpoint } from './close/endpoint';
import { specsOverviewEndpoint } from './overview/endpoint';
import type { SpecsOverviewRepository } from './overview/repository/read-repository';
import { createEngineSpecsOverviewRepository } from './overview/repository/engine-repository';
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
  readonly sessions?: SessionReferenceOwner;
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
      ? createEngineSpecsOverviewRepository(options.dependencies.engine)
      : undefined);
  // Same rule for the workspace identity: an injected repository (demo) wins, the Engine is the
  // production source and its absence is an unavailable source.
  const workspaceRepository =
    options.dependencies?.workspaceRepository ??
    (options.dependencies?.engine
      ? createEngineWorkspaceRepository(options.dependencies.engine)
      : undefined);
  const config = options.config ?? defaultSpecsFeatureConfig();

  return {
    authorizationResources: [SpecCapabilities, ProjectGitCapabilities],
    register(app) {
      app.register(specsCreateEndpoint, {
        engine: options.dependencies?.engine,
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
          registry: options.dependencies.progress.registry,
          ...(options.dependencies.progress.now ? { now: options.dependencies.progress.now } : {}),
          ...(options.dependencies.progress.staleAfterMs !== undefined
            ? { config: { staleAfterMs: options.dependencies.progress.staleAfterMs } }
            : {}),
        });
      }
      app.register(specsCloseEndpoint, { engine: options.dependencies?.engine });
      app.register(specsOverviewEndpoint, {
        repository,
        currentSections: config.overview.current.sections,
      });
      app.register(specificationWorkspaceEndpoint, {
        repository: workspaceRepository,
        contributions: options.dependencies?.contributions,
        sessions: options.dependencies?.sessions,
      });
    },
  };
}
