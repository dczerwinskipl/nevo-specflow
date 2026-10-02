import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { mergeRuntimeConfigValues } from './merge.js';
import { parseRuntimeConfig, RuntimeConfigError } from './parse.js';
import type { LoadedRuntimeConfig } from './types.js';

export const DEFAULT_PROJECT_CONFIG_PATH = 'nevo-specflow.yaml';
export const DEFAULT_LOCAL_CONFIG_PATH = '.nevo-local/nevo-specflow.yaml';

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

  const projectSource = await readRequiredConfig(projectPath);
  const localExists = await fileExists(localPath);
  const localSource = localExists ? await readRequiredConfig(localPath) : undefined;

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
