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

  const server: Record<string, unknown> = {
    host: '127.0.0.1',
    port: 4318,
    ...(auth.requiresPublicOrigin ? { publicOrigin: 'http://localhost:4318' } : {}),
    tls: { enabled: false },
  };

  const projectConfig = {
    server,
    auth: auth.projectAuth,
  };
  const localConfig = {
    auth: auth.localAuth,
  };

  // Runtime owns these config sections, so it validates the exact effective result
  // before handing a contribution back to the product-level project initializer.
  parseRuntimeConfig(mergeRuntimeConfigValues(projectConfig, localConfig));

  return {
    projectConfig,
    localConfig,
  };
}
