// Reads the project and local configuration files for the `docs` command. Either file may be absent
// (defaults apply); only `docs` and `ai.embeddings` are read and validated, by the same
// `parseDocsConfiguration` Runtime config loading uses.

import { existsSync, readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { DocsConfigError } from '../errors';
import { parseDocsConfiguration, type DocsConfiguration } from './docs-configuration';

export interface DocsConfigPaths {
  /** `.nevo/config.yaml` of the project. */
  readonly projectConfigPath: string;
  /** `.nevo/local/config.yaml` of the workstation. */
  readonly localConfigPath: string;
}

function readTopLevel(path: string): Record<string, unknown> | undefined {
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
