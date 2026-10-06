import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { parse } from 'yaml';

import { assertNoLocalAuthorization, validateProjectAuthorizationSource } from '../features/auth';
import { parseSpecsFeatureConfig } from '../features/specs';
import { RuntimeConfigError } from './parsing/runtime-config-error';
import {
  assertLocalRuntimeConfigOwnership,
  assertProjectRuntimeConfigOwnership,
} from './ownership';
import { mergeRuntimeConfigValues } from './merge';
import { parseRuntimeConfig } from './parse';
import type { LoadedRuntimeConfig } from './types';
import { isRecord } from './parsing/value-parsers';

export interface LoadRuntimeConfigOptions {
  readonly projectConfigPath: string;
  readonly localConfigPath?: string;
}

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions,
): Promise<LoadedRuntimeConfig> {
  assertAbsolutePath(options.projectConfigPath, 'projectConfigPath');
  if (options.localConfigPath) {
    assertAbsolutePath(options.localConfigPath, 'localConfigPath');
  }

  const projectPath = options.projectConfigPath;
  const localPath = options.localConfigPath;

  const projectDocument = await readRequiredConfig(projectPath);
  const projectSource = runtimeSection(projectDocument, projectPath, true);
  const specs = parseSpecsFeatureConfig(
    isRecord(projectDocument) ? projectDocument.specs : undefined,
  );
  assertProjectRuntimeConfigOwnership(projectSource);
  validateProjectAuthorizationSource(projectSource);

  let localExists = false;
  let localSource: Record<string, unknown> | undefined;

  if (localPath) {
    localExists = await fileExists(localPath);
    if (localExists) {
      const localDocument = await readRequiredConfig(localPath);
      if (isRecord(localDocument) && localDocument.specs !== undefined) {
        throw new RuntimeConfigError(
          'Specs Overview configuration is project-owned and cannot be set locally.',
        );
      }

      localSource = runtimeSection(localDocument, localPath, false);
      if (localSource) {
        assertNoLocalAuthorization(localSource);
        assertLocalRuntimeConfigOwnership(localSource);
      }
    }
  }

  const merged = localSource ? mergeRuntimeConfigValues(projectSource, localSource) : projectSource;

  return {
    config: { ...parseRuntimeConfig(merged), specs },
    sources: {
      project: projectPath,
      ...(localExists && localPath ? { local: localPath } : {}),
    },
  };
}

function assertAbsolutePath(path: string, name: string): void {
  if (!isAbsolute(path)) {
    throw new RuntimeConfigError(`${name} must be an absolute path supplied by the product shell.`);
  }
}

async function readRequiredConfig(path: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new RuntimeConfigError(`Required SpecFlow config file not found: ${path}`);
    }
    throw error;
  }

  try {
    return parse(source, { prettyErrors: false });
  } catch {
    throw new RuntimeConfigError(`Invalid YAML in ${path}.`);
  }
}

function runtimeSection(value: unknown, path: string, required: true): Record<string, unknown>;
function runtimeSection(
  value: unknown,
  path: string,
  required: false,
): Record<string, unknown> | undefined;
function runtimeSection(
  value: unknown,
  path: string,
  required: boolean,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    throw new RuntimeConfigError(`SpecFlow config root must be an object: ${path}`);
  }

  const runtime = value.runtime;
  if (runtime === undefined && !required) return undefined;
  if (!isRecord(runtime)) {
    throw new RuntimeConfigError(`SpecFlow config must define an object at 'runtime': ${path}`);
  }

  return runtime;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
