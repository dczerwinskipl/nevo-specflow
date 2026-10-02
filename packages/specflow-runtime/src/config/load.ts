import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { assertNoProjectAuthSecrets } from '../auth/config.js';
import { RuntimeConfigError } from './error.js';
import { mergeRuntimeConfigValues } from './merge.js';
import { parseRuntimeConfig } from './parse.js';
import type { LoadedRuntimeConfig } from './types.js';
import { childRecord, isRecord } from './value.js';

export const DEFAULT_PROJECT_CONFIG_PATH = '.nevo/config.yaml';
export const DEFAULT_LOCAL_CONFIG_PATH = '.nevo/local/config.yaml';

export interface LoadRuntimeConfigOptions {
  readonly cwd?: string;
  readonly projectPath?: string;
  readonly localPath?: string;
}

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<LoadedRuntimeConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const projectPath = resolve(cwd, options.projectPath ?? DEFAULT_PROJECT_CONFIG_PATH);
  const localPath = resolve(cwd, options.localPath ?? DEFAULT_LOCAL_CONFIG_PATH);

  const projectDocument = await readRequiredConfig(projectPath);
  const projectSource = runtimeSection(projectDocument, projectPath, true);
  assertNoProjectSecrets(projectSource);

  const localExists = await fileExists(localPath);
  const localDocument = localExists ? await readRequiredConfig(localPath) : undefined;
  const localSource =
    localDocument === undefined ? undefined : runtimeSection(localDocument, localPath, false);

  const merged = localSource ? mergeRuntimeConfigValues(projectSource, localSource) : projectSource;

  return {
    config: parseRuntimeConfig(merged),
    sources: {
      project: projectPath,
      ...(localExists ? { local: localPath } : {}),
    },
  };
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
    return parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RuntimeConfigError(`Invalid YAML in ${path}: ${message}`);
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

function assertNoProjectSecrets(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  assertNoProjectAuthSecrets(childRecord(value, 'auth'));
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
