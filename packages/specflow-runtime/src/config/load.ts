import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
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
  assertNoProjectSecrets(projectSource);

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

function assertNoProjectSecrets(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const auth = childRecord(value, 'auth');
  const providers = childRecord(auth, 'providers');
  const google = childRecord(providers, 'google');

  if (google && Object.hasOwn(google, 'clientSecret')) {
    throw new RuntimeConfigError(
      'auth.providers.google.clientSecret must be configured only in the local SpecFlow config.',
    );
  }

  const password = childRecord(providers, 'password');
  const accounts = childRecord(password, 'accounts');
  if (!accounts) {
    return;
  }

  for (const [username, rawAccount] of Object.entries(accounts)) {
    if (isRecord(rawAccount) && Object.hasOwn(rawAccount, 'passwordHash')) {
      throw new RuntimeConfigError(
        `auth.providers.password.accounts.${username}.passwordHash must be configured only in the local SpecFlow config.`,
      );
    }
  }
}

function childRecord(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
