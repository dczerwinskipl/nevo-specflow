import { initAuth, type AuthInitOptions } from '../auth/authentication/init';
import { assertNoLocalAuthorization, validateProjectAuthorizationSource } from '../auth/authorization/config-source';
import { initAuthorization } from '../auth/authorization/init';
import { mergeRuntimeConfigValues } from '../config/merge';
import {
  assertLocalRuntimeConfigOwnership,
  assertProjectRuntimeConfigOwnership,
} from '../config/ownership';
import { parseRuntimeConfig } from '../config/parse';
import type { RuntimeInitContribution, RuntimeSetupUi } from './contracts';

export interface RuntimeInitOptions {
  readonly ui: RuntimeSetupUi;
  readonly hashPassword?: AuthInitOptions['hashPassword'];
}

export async function initRuntime(options: RuntimeInitOptions): Promise<RuntimeInitContribution> {
  const auth = await initAuth({
    ui: options.ui,
    ...(options.hashPassword ? { hashPassword: options.hashPassword } : {}),
  });
  const authorization = await initAuthorization(options.ui, auth.users);

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
    authorization: authorization.projectAuthorization,
  };
  const localConfig = {
    auth: auth.localAuth,
  };

  validateGeneratedRuntimeConfig(projectConfig, localConfig);

  return {
    projectConfig,
    localConfig,
    summary: [
      `Runtime: http://${host}:${String(port)}`,
      auth.summary,
      authorization.summary,
    ],
  };
}

function validateGeneratedRuntimeConfig(
  projectConfig: Record<string, unknown>,
  localConfig: Record<string, unknown>,
): void {
  assertProjectRuntimeConfigOwnership(projectConfig);
  validateProjectAuthorizationSource(projectConfig);
  assertLocalRuntimeConfigOwnership(localConfig);
  assertNoLocalAuthorization(localConfig);
  parseRuntimeConfig(mergeRuntimeConfigValues(projectConfig, localConfig));
}
