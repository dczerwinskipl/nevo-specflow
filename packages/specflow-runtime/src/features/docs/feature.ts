import {
  DEFAULT_DOCS_SETTINGS,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
} from '@nevo/specflow-docs';
import { DocsCapabilities } from '@nevo/specflow-contracts/docs';

import type { RuntimeFeature } from '../runtime-feature';
import type { DocsProjectId } from './access';
import { createProjectDocs } from './project-docs';
import { docsSearchEndpoint } from './search-route';
import { docsStatusEndpoint } from './status-route';

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
}

export function createDocsFeature(options: CreateDocsFeatureOptions): RuntimeFeature {
  const configuration = options.configuration ?? {
    docs: DEFAULT_DOCS_SETTINGS,
    embeddings: undefined,
  };
  const dependencies = options.dependencies ?? {};
  const { projectRoot } = dependencies;

  return {
    authorizationResources: [DocsCapabilities],
    register(app) {
      const docs =
        projectRoot === undefined
          ? undefined
          : createProjectDocs({
              projectRoot,
              configuration,
              env: dependencies.env ?? process.env,
              log: app.log,
              ...(dependencies.createProvider
                ? { createProvider: dependencies.createProvider }
                : {}),
            });
      const { projectId } = options;
      app.register(docsSearchEndpoint, { docs, projectId });
      app.register(docsStatusEndpoint, { docs, projectId });
      if (docs !== undefined) {
        // Ends a refresh a search started, whether or not the start refresh runs.
        app.addHook('onClose', () => docs.close());
      }

      // Only a project that opted into semantic search and configured an embedding endpoint has an
      // index to refresh; otherwise nothing is written below `.nevo/` and nothing is logged (a
      // committed opt-in without a workstation endpoint is a normal lexical setup).
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
