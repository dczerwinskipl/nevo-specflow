import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { stringify } from 'yaml';

export interface ProjectConfigContribution {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
}

export interface InitializeProjectOptions {
  readonly cwd: string;
  readonly initRuntime: () => Promise<ProjectConfigContribution>;
}

export interface InitializeProjectResult {
  readonly root: string;
  readonly projectConfigPath: string;
  readonly localConfigPath: string;
}

const PROJECT_CONFIG_PATH = join('.nevo', 'config.yaml');
const LOCAL_CONFIG_PATH = join('.nevo', 'local', 'config.yaml');
const LOCAL_IGNORE_ENTRY = '.nevo/local/';

export async function initializeProject(
  options: InitializeProjectOptions,
): Promise<InitializeProjectResult> {
  const root = await findRepositoryRoot(options.cwd);
  const projectConfigPath = join(root, PROJECT_CONFIG_PATH);
  const localConfigPath = join(root, LOCAL_CONFIG_PATH);

  if (await fileExists(projectConfigPath)) {
    throw new Error(`Nevo SpecFlow is already initialized: ${projectConfigPath}`);
  }
  if (await fileExists(localConfigPath)) {
    throw new Error(
      `Refusing to overwrite existing workstation-local SpecFlow config: ${localConfigPath}`,
    );
  }

  const runtime = await options.initRuntime();
  const projectConfig = { runtime: runtime.projectConfig };
  const localConfig = { runtime: runtime.localConfig };

  await ensureLocalIgnore(root);
  await mkdir(dirname(projectConfigPath), { recursive: true });
  await mkdir(dirname(localConfigPath), { recursive: true });
  await writeFile(projectConfigPath, serializeConfig(projectConfig), 'utf8');
  await writeFile(localConfigPath, serializeConfig(localConfig), {
    encoding: 'utf8',
    mode: 0o600,
  });

  return {
    root,
    projectConfigPath,
    localConfigPath,
  };
}

function serializeConfig(value: unknown): string {
  return `${stringify(value, { lineWidth: 0 }).trimEnd()}\n`;
}

async function ensureLocalIgnore(root: string): Promise<void> {
  const gitignorePath = join(root, '.gitignore');
  let current = '';

  if (await fileExists(gitignorePath)) {
    current = await readFile(gitignorePath, 'utf8');
    const entries = current
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    if (entries.includes(LOCAL_IGNORE_ENTRY) || entries.includes(`/${LOCAL_IGNORE_ENTRY}`)) {
      return;
    }
  }

  const prefix = current.length === 0 ? '' : current.endsWith('\n') ? current : `${current}\n`;
  const separator = prefix.length === 0 || prefix.endsWith('\n\n') ? '' : '\n';
  await writeFile(
    gitignorePath,
    `${prefix}${separator}# Nevo SpecFlow workstation-local configuration and state\n${LOCAL_IGNORE_ENTRY}\n`,
    'utf8',
  );
}

async function findRepositoryRoot(cwd: string): Promise<string> {
  let current = resolve(cwd);

  while (true) {
    if (await fileExists(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error('nevo-specflow init must be run inside a Git repository.');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}
