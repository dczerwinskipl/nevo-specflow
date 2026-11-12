import {
  DEFAULT_DOCS_SETTINGS,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
} from '@nevo/specflow-docs';
import { DocsCapabilities } from '@nevo/specflow-contracts/docs';
import type { SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { DocsProjectId } from './access';
import { docsSearchEndpoint } from './search-route';
import { docsStatusEndpoint } from './status-route';
import { createRefreshSlot } from './workspace-corpus/background-refresh';
import { engineWorkspaceResolver } from './workspace-corpus/engine-resolution';
import { createProjectDocs } from './workspace-corpus/project-docs';
import {
  createWorkspaceCorpora,
  type WorkspaceCorpora,
  type WorkspaceDocsRelease,
} from './workspace-corpus/workspace-corpora';

export interface DocsFeatureDependencies {
  /**
   * Absolute project root whose `docs.root` is the corpus. Absent (demo data, most tests): the
   * search answers `503 DOCS_UNAVAILABLE` and nothing is refreshed.
   */
  readonly projectRoot?: string;
  /** Environment the embedding API key variable is read from (default `process.env`). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Test seam; production uses the OpenAI-compatible adapter. */
  readonly createProvider?: CreateEmbeddingProvider;
  /**
   * Refresh the index in the background when the Runtime is ready (default true; tests). A search
   * that finds a gap larger than it embeds starts that refresh either way.
   */
  readonly startRefresh?: boolean;
}

export interface CreateDocsFeatureOptions {
  /** The loaded `docs` and `ai.embeddings` settings; absent: the defaults (lexical search). */
  readonly configuration?: DocsConfiguration;
  readonly dependencies?: DocsFeatureDependencies;
  /** The Runtime's project, the scope of `docs.view`; without one every docs route answers `503`. */
  readonly projectId: DocsProjectId;
  /** Resolves the registered workspaces whose documentation is read; absent: none is. */
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
  const configuration = options.configuration ?? {
    docs: DEFAULT_DOCS_SETTINGS,
    embeddings: undefined,
  };
  const dependencies = options.dependencies ?? {};
  const { projectRoot } = dependencies;
  const env = dependencies.env ?? process.env;
  // Created when the feature registers; before that no instance exists to release. The workspace
  // documentation endpoints read through `createWorkspaceDocsOperations(corpora)`.
  let corpora: WorkspaceCorpora | undefined;

  return {
    authorizationResources: [DocsCapabilities],
    releaseWorkspaceDocs: (workspaceId) =>
      corpora === undefined ? Promise.resolve(NOTHING_HELD) : corpora.release(workspaceId),
    register(app) {
      // One background index job at a time in the whole Runtime (E8).
      const slot = createRefreshSlot();
      const providerSeam = dependencies.createProvider
        ? { createProvider: dependencies.createProvider }
        : {};
      const docs =
        projectRoot === undefined
          ? undefined
          : createProjectDocs({
              projectRoot,
              configuration,
              env,
              log: app.log,
              slot,
              ...providerSeam,
            });
      const { engine } = options;
      if (engine !== undefined) {
        corpora = createWorkspaceCorpora({
          resolve: engineWorkspaceResolver(engine),
          projectHome: engine.context.project.homeRoot,
          trustedEmbeddings: configuration.embeddings,
          env,
          log: app.log,
          slot,
          ...providerSeam,
        });
      }

      const { projectId } = options;
      app.register(docsSearchEndpoint, { docs, projectId });
      app.register(docsStatusEndpoint, { docs, projectId });
      // Ends every refresh, whether or not the start refresh runs.
      app.addHook('onClose', async () => {
        await Promise.all([docs?.close(), corpora?.close()]);
      });

      // Only a project that opted into semantic search and configured an embedding endpoint has an
      // index to refresh; otherwise nothing is written below `.nevo/` and nothing is logged (a
      // committed opt-in without a workstation endpoint is a normal lexical setup). It targets the
      // Runtime's own checkout only.
      if (
        docs === undefined ||
        dependencies.startRefresh === false ||
        !configuration.docs.search.semantic ||
        configuration.embeddings === undefined
      ) {
        return;
      }

      app.addHook('onReady', (done) => {
        docs.startRefresh();
        done();
      });
    },
  };
}
