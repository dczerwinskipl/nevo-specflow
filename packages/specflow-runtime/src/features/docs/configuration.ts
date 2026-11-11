import {
  DocsConfigError,
  parseDocsConfiguration,
  type DocsConfiguration,
} from '@nevo/specflow-docs';

import { RuntimeConfigError } from '../../config/parsing/runtime-config-error';
import { isRecord } from '../../config/parsing/value-parsers';

export interface DocsConfigurationDocuments {
  /** The parsed project configuration file. */
  readonly project: unknown;
  /** The parsed local configuration file; `undefined` when there is none. */
  readonly local: unknown;
  readonly projectPath: string;
  readonly localPath: string | undefined;
}

/**
 * Validate `docs` and `ai.embeddings` with the documentation capability's own entry, so the Runtime
 * and the `nevo-specflow docs` command apply identical ownership rules (a local `docs` section, a
 * secret literal or an incomplete endpoint fail start like any other invalid section).
 */
export function parseDocsFeatureConfig(documents: DocsConfigurationDocuments): DocsConfiguration {
  try {
    return parseDocsConfiguration({
      project: isRecord(documents.project) ? documents.project : undefined,
      local: isRecord(documents.local) ? documents.local : undefined,
      projectLabel: documents.projectPath,
      localLabel: documents.localPath ?? 'the local configuration',
    });
  } catch (error) {
    if (error instanceof DocsConfigError) {
      throw new RuntimeConfigError(error.message);
    }

    throw error;
  }
}
