import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  hashPassword as hashRuntimePassword,
  mergeRuntimeConfigValues,
  parseRuntimeConfig,
  serializeRuntimeConfig,
} from '@nevo/specflow-runtime';

export type ProjectInitInput =
  | {
      readonly authMode: 'none';
      readonly userId: string;
      readonly displayName: string;
    }
  | {
      readonly authMode: 'password';
      readonly userId: string;
      readonly displayName: string;
      readonly username: string;
      readonly password: string;
    }
  | {
      readonly authMode: 'oidc';
      readonly userId: string;
      readonly displayName: string;
      readonly issuer: string;
      readonly clientId: string;
      readonly clientSecret: string;
      readonly allowedEmail: string;
    };

export interface InitializeProjectOptions {
  readonly cwd: string;
  readonly input: ProjectInitInput;
  readonly hashPassword?: (password: string) => Promise<string>;
}

export interface InitializeProjectResult {
  readonly root: string;
  readonly projectConfigPath: string;
  readonly localConfigPath: string;
  readonly authMode: ProjectInitInput['authMode'];
}

interface InitPlan {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
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

  const plan = await createInitPlan(options.input, options.hashPassword ?? hashRuntimePassword);

  // Validate the exact effective configuration before touching the repository.
  parseRuntimeConfig(mergeRuntimeConfigValues(plan.projectConfig, plan.localConfig));

  await ensureLocalIgnore(root);
  await mkdir(dirname(projectConfigPath), { recursive: true });
  await mkdir(dirname(localConfigPath), { recursive: true });
  await writeFile(projectConfigPath, serializeRuntimeConfig(plan.projectConfig), 'utf8');
  await writeFile(localConfigPath, serializeRuntimeConfig(plan.localConfig), {
    encoding: 'utf8',
    mode: 0o600,
  });

  return {
    root,
    projectConfigPath,
    localConfigPath,
    authMode: options.input.authMode,
  };
}

async function createInitPlan(
  input: ProjectInitInput,
  hashPassword: (password: string) => Promise<string>,
): Promise<InitPlan> {
  const user = {
    [input.userId]: {
      name: input.displayName,
    },
  };

  const server: Record<string, unknown> = {
    host: '127.0.0.1',
    port: 4318,
    tls: { enabled: false },
  };

  if (input.authMode === 'none') {
    return {
      projectConfig: {
        server,
        auth: {
          mode: 'none',
          users: user,
          providers: {
            password: { enabled: false },
            oidc: { enabled: false },
          },
        },
      },
      localConfig: {
        auth: {
          localUserId: input.userId,
        },
      },
    };
  }

  if (input.authMode === 'password') {
    const passwordHash = await hashPassword(input.password);
    return {
      projectConfig: {
        server,
        auth: {
          mode: 'required',
          users: user,
          providers: {
            password: { enabled: true },
            oidc: { enabled: false },
          },
        },
      },
      localConfig: {
        auth: {
          providers: {
            password: {
              accounts: {
                [input.username]: {
                  userId: input.userId,
                  passwordHash,
                },
              },
            },
          },
        },
      },
    };
  }

  return {
    projectConfig: {
      server: {
        ...server,
        publicOrigin: 'http://localhost:4318',
      },
      auth: {
        mode: 'required',
        users: user,
        providers: {
          password: { enabled: false },
          oidc: {
            enabled: true,
            issuer: input.issuer,
            clientId: input.clientId,
            allowedEmails: {
              [input.allowedEmail]: input.userId,
            },
          },
        },
      },
    },
    localConfig: {
      auth: {
        providers: {
          oidc: {
            clientSecret: input.clientSecret,
          },
        },
      },
    },
  };
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
