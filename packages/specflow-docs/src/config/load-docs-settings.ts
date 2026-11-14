// Reads the configuration files of the documentation capability: the project and local
// configuration (for the `docs` command; either may be absent and defaults apply; only `docs` and
// `ai.embeddings` are read and validated, by the same `parseDocsConfiguration` Runtime config
// loading uses) and the optional `<docs.root>/docs.yaml` (whenever a corpus is opened).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

import { DocsConfigError } from '../errors';
import { parseDocsConfiguration, type DocsConfiguration } from './docs-configuration';
import { DOCS_FILE_NAME, parseDocsFile, type DocsFileSettings } from './docs-file';

export interface DocsConfigPaths {
  /** `.nevo/config.yaml` of the project. */
  readonly projectConfigPath: string;
  /** `.nevo/local/config.yaml` of the workstation. */
  readonly localConfigPath: string;
}

export function readTopLevel(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new DocsConfigError(
      `Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (parsed === null || parsed === undefined) {
    return undefined;
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DocsConfigError(`${path} must contain a YAML mapping.`);
  }

  return parsed as Record<string, unknown>;
}

/** Read both files (either may be absent) and validate the namespaces this package owns. */
export function loadDocsSettings(paths: DocsConfigPaths): DocsConfiguration {
  return parseDocsConfiguration({
    project: readTopLevel(paths.projectConfigPath),
    local: readTopLevel(paths.localConfigPath),
    projectLabel: paths.projectConfigPath,
    localLabel: paths.localConfigPath,
  });
}

/**
 * Read and validate `<docs.root>/docs.yaml`; an absent or empty file means the defaults. Throws
 * `DocsConfigError` naming the file and the key of the first problem.
 */
export function loadDocsFile(projectRoot: string, root: string): DocsFileSettings {
  const path = join(projectRoot, ...root.split('/'), DOCS_FILE_NAME);
  const value = readTopLevel(path);
  try {
    return parseDocsFile(value);
  } catch (err) {
    if (err instanceof DocsConfigError) {
      throw new DocsConfigError(`${path}: ${err.message}`, { cause: err });
    }

    throw err;
  }
}
