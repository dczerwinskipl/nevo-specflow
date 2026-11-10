import {
  DEFAULT_DOCS_SETTINGS,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
} from '@nevo/specflow-docs';
import { DocsCapabilities } from '@nevo/specflow-contracts/docs';

import type { RuntimeFeature } from '../runtime-feature';
import { createProjectDocs } from './project-docs';
import { docsSearchEndpoint } from './search-route';
import { createStartRefresh } from './start-refresh';

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
  /** Refresh the index in the background when the Runtime is ready (default true; tests). */
  readonly startRefresh?: boolean;
}

export interface CreateDocsFeatureOptions {
  /** The loaded `docs` and `ai.embeddings` settings; absent: the defaults (lexical search). */
  readonly configuration?: DocsConfiguration;
  readonly dependencies?: DocsFeatureDependencies;
}

export function createDocsFeature(options: CreateDocsFeatureOptions = {}): RuntimeFeature {
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
              ...(dependencies.createProvider
                ? { createProvider: dependencies.createProvider }
                : {}),
            });
      app.register(docsSearchEndpoint, { docs });

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

      const refresh = createStartRefresh(docs, app.log);
      app.addHook('onReady', (done) => {
        refresh.start();
        done();
      });
      app.addHook('onClose', () => refresh.stop());
    },
  };
}
