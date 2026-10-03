import { initAuth, type AuthInitOptions } from '../auth/authentication/init';
import { mergeRuntimeConfigValues } from '../config/merge';
import { parseRuntimeConfig } from '../config/parse';
import type { RuntimeInitContribution, RuntimeInitPrompter } from './contracts';

export interface RuntimeInitOptions {
  readonly prompter: RuntimeInitPrompter;
  readonly hashPassword?: AuthInitOptions['hashPassword'];
}

export async function initRuntime(options: RuntimeInitOptions): Promise<RuntimeInitContribution> {
  const auth = await initAuth({
    prompter: options.prompter,
    ...(options.hashPassword ? { hashPassword: options.hashPassword } : {}),
  });

  const host = '127.0.0.1';
  const port = 4318;
  const server: Record<string, unknown> = {
    host,
    port,
    ...(auth.requiresPublicOrigin ? { publicOrigin: `http://${host}:${String(port)}` } : {}),
    tls: { enabled: false },
  };

  const projectConfig = {
    server,
    auth: auth.projectAuth,
  };
  const localConfig = {
    auth: auth.localAuth,
  };

  parseRuntimeConfig(mergeRuntimeConfigValues(projectConfig, localConfig));

  return {
    projectConfig,
    localConfig,
  };
}
