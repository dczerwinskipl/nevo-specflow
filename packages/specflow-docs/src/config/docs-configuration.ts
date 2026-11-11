// The one validation entry for the configuration this package owns: the project-only `docs`
// namespace and `ai.embeddings` (project and local, local wins per key). The `docs` command and
// Runtime config loading both call it with the parsed top level of each file, so both entry points
// apply identical ownership rules. It reads no files and no environment.

import { DocsConfigError } from '../errors';
import { parseDocsConfig, type DocsSettings } from './docs-settings';
import {
  embeddingsSection,
  mergeEmbeddingsLayers,
  parseEmbeddingsLayer,
  type EmbeddingsSettings,
} from '../embeddings/embeddings-settings';
import type { ConfigRecord } from './values';

export interface DocsConfiguration {
  readonly docs: DocsSettings;
  /** `undefined`: no embedding endpoint is configured. */
  readonly embeddings: EmbeddingsSettings | undefined;
}

/** The parsed top level of each configuration file; an absent file is `undefined`. */
export interface DocsConfigurationSources {
  readonly project: ConfigRecord | undefined;
  readonly local: ConfigRecord | undefined;
  /** How errors name the files, for example their paths. */
  readonly projectLabel: string;
  readonly localLabel: string;
}

function inFile<T>(label: string, parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof DocsConfigError) {
      throw new DocsConfigError(`${label}: ${err.message}`, { cause: err });
    }

    throw err;
  }
}

/**
 * Validate `docs` and `ai.embeddings` and resolve the effective settings. Other namespaces are not
 * read. Throws `DocsConfigError` naming the file and key of the first problem: a local `docs`
 * section, an unknown or invalid key, a secret-like key or value, or an incomplete endpoint.
 */
export function parseDocsConfiguration(sources: DocsConfigurationSources): DocsConfiguration {
  const { project, local, projectLabel, localLabel } = sources;
  if (local && 'docs' in local) {
    throw new DocsConfigError(
      `${localLabel}: documentation configuration is project-owned and cannot be set locally; move 'docs' to ${projectLabel}.`,
    );
  }

  const docs = inFile(projectLabel, () => parseDocsConfig(project?.docs));
  const projectEmbeddings = inFile(projectLabel, () =>
    parseEmbeddingsLayer(embeddingsSection(project)),
  );
  const localEmbeddings = inFile(localLabel, () => parseEmbeddingsLayer(embeddingsSection(local)));
  const mergedLabel = [projectEmbeddings && projectLabel, localEmbeddings && localLabel]
    .filter(Boolean)
    .join(' + ');
  const embeddings = inFile(mergedLabel, () =>
    mergeEmbeddingsLayers(projectEmbeddings, localEmbeddings),
  );

  return { docs, embeddings };
}
