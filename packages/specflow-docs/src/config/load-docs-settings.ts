// Reads the `docs` namespace from the project configuration files for the `docs` command. Either file
// may be absent (defaults apply); only the `docs` namespace is read and validated, and a `docs`
// section in the local file is rejected because the namespace is project-owned.

import { existsSync, readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { DocsConfigError } from '../errors';
import { parseDocsConfig, type DocsSettings } from './docs-settings';

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

export function loadDocsSettings(paths: DocsConfigPaths): DocsSettings {
  const local = readTopLevel(paths.localConfigPath);
  if (local && 'docs' in local) {
    throw new DocsConfigError(
      `${paths.localConfigPath}: documentation configuration is project-owned and cannot be set locally; move 'docs' to ${paths.projectConfigPath}.`,
    );
  }

  const project = readTopLevel(paths.projectConfigPath);
  try {
    return parseDocsConfig(project?.docs);
  } catch (err) {
    if (err instanceof DocsConfigError) {
      throw new DocsConfigError(`${paths.projectConfigPath}: ${err.message}`, { cause: err });
    }

    throw err;
  }
}
