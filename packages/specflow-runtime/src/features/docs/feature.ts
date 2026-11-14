import type { CreateEmbeddingProvider, DocsConfiguration } from '@nevo/specflow-docs';
import { DocsCapabilities } from '@nevo/specflow-contracts/docs';
import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { DocsProjectId } from './route-support';
import { docsArticleEndpoint } from './article/endpoint';
import { docsSearchEndpoint } from './search/endpoint';
import { docsTreeEndpoint } from './tree/endpoint';
import { createRefreshSlot } from './workspace-corpus/background-refresh';
import { engineWorkspaceResolver } from './workspace-corpus/engine-resolution';
import { createWorkspaceDocsOperations } from './workspace-corpus/operations';
import {
  createWorkspaceCorpora,
  type WorkspaceCorpora,
  type WorkspaceDocsRelease,
} from './workspace-corpus/workspace-corpora';

export interface DocsFeatureDependencies {
  /** Environment the embedding API key variable is read from (default `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam; production uses the OpenAI-compatible adapter. */
  readonly createProvider?: CreateEmbeddingProvider;
  /**
   * Refresh the index of the Runtime's own checkout in the background when the Runtime is ready
   * (default true; tests). A search that finds a gap larger than it embeds starts that refresh
   * either way.
   */
  readonly startRefresh?: boolean;
}

export interface CreateDocsFeatureOptions {
  /**
   * The settings loaded at start. Only its trusted `ai.embeddings` is used (C10); each checkout's
   * `docs` settings are read again on every request. Absent: no endpoint (lexical search).
   */
  readonly configuration?: DocsConfiguration;
  readonly dependencies?: DocsFeatureDependencies;
  /** The Runtime's project, the scope of `docs.view`; without one every docs route answers `503`. */
  readonly projectId: DocsProjectId;
  /**
   * Resolves the registered workspaces whose documentation is read; absent (demo data): every docs
   * route answers `503 DOCS_UNAVAILABLE`.
   */
  readonly engine?: SpecFlowEngine;
}

/**
 * E9: called before Close deletes a workspace's checkout. Resolves once nothing of the Runtime's
 * documentation reads or writes there; the workspace's documentation answers unavailable until
 * `end`.
 */
export type ReleaseWorkspaceDocs = (workspaceId: string) => Promise<WorkspaceDocsRelease>;

export interface DocsFeature extends RuntimeFeature {
  readonly releaseWorkspaceDocs: ReleaseWorkspaceDocs;
}

const NOTHING_HELD: WorkspaceDocsRelease = { end: () => undefined };

export function createDocsFeature(options: CreateDocsFeatureOptions): DocsFeature {
  const trustedEmbeddings = options.configuration?.embeddings;
  const dependencies = options.dependencies ?? {};
  const env = dependencies.env ?? process.env;
  // Created when the feature registers; before that no instance exists to release.
  let corpora: WorkspaceCorpora | undefined;

  return {
    authorizationResources: [DocsCapabilities],
    releaseWorkspaceDocs: (workspaceId) =>
      corpora === undefined ? Promise.resolve(NOTHING_HELD) : corpora.release(workspaceId),
    register(app) {
      const { engine, projectId } = options;
      // Without an Engine there are no workspaces: every route answers `503 DOCS_UNAVAILABLE`.
      const workspaces =
        engine === undefined
          ? undefined
          : createWorkspaceCorpora({
              resolve: engineWorkspaceResolver(engine),
              // Read at seed time: registration does not touch the Engine.
              projectHome: () => engine.context.project.homeRoot,
              trustedEmbeddings,
              env,
              log: app.log,
              // One background index job at a time in the whole Runtime (E8).
              slot: createRefreshSlot(),
              ...(dependencies.createProvider
                ? { createProvider: dependencies.createProvider }
                : {}),
            });
      corpora = workspaces;

      const endpoint = {
        operations:
          workspaces === undefined ? undefined : createWorkspaceDocsOperations(workspaces),
        projectId,
      };
      app.register(docsTreeEndpoint, endpoint);
      app.register(docsArticleEndpoint, endpoint);
      app.register(docsSearchEndpoint, endpoint);

      if (workspaces === undefined) {
        return;
      }

      // Ends every refresh, the start refresh included.
      app.addHook('onClose', () => workspaces.close());
      // ADR 0020's start refresh, for the Runtime's own checkout only, through its workspace
      // instance, so a release before Close stops it too. Without a trusted endpoint there is
      // nothing to refresh; a checkout with semantic search off opens nothing.
      if (
        engine === undefined ||
        dependencies.startRefresh === false ||
        trustedEmbeddings === undefined
      ) {
        return;
      }

      app.addHook('onReady', (done) => {
        void workspaces.startRefresh(engine.workspace.workspaceId).catch((error: unknown) => {
          app.log.warn({ err: error }, 'The documentation index was not refreshed.');
        });
        done();
      });
    },
  };
}
