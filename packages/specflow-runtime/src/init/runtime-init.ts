import { initAuth, type AuthInitOptions } from '../auth/authentication/init';
import {
  assertNoLocalAuthorization,
  validateProjectAuthorizationSource,
} from '../auth/authorization/config-source';
import { createAuthorizationSetup } from '../auth/authorization/init';
import { mergeRuntimeConfigValues } from '../config/merge';
import {
  assertLocalRuntimeConfigOwnership,
  assertProjectRuntimeConfigOwnership,
} from '../config/ownership';
import { parseRuntimeConfig } from '../config/parse';
import type { RuntimeInitContribution, RuntimeSetupUi } from './contracts';

const LOCAL_RUNTIME_HOST = '127.0.0.1';
const LOCAL_RUNTIME_PORT = 4318;
const LOCAL_PRODUCT_ORIGIN = `http://${LOCAL_RUNTIME_HOST}:${String(LOCAL_RUNTIME_PORT)}`;

export interface RuntimeInitOptions {
  readonly ui: RuntimeSetupUi;
  readonly hashPassword?: AuthInitOptions['hashPassword'];
}

export async function initRuntime(options: RuntimeInitOptions): Promise<RuntimeInitContribution> {
  const authorizationSetup = createAuthorizationSetup(options.ui);
  const auth = await initAuth({
    ui: options.ui,
    onUserCreated: (userId, user) => authorizationSetup.addUser(userId, user),
    ...(options.hashPassword ? { hashPassword: options.hashPassword } : {}),
  });
  const authorization = await authorizationSetup.finish();

  const publicOrigin = auth.requiresPublicOrigin ? LOCAL_PRODUCT_ORIGIN : undefined;
  const server: Record<string, unknown> = {
    host: LOCAL_RUNTIME_HOST,
    port: LOCAL_RUNTIME_PORT,
    ...(publicOrigin ? { publicOrigin } : {}),
    tls: { enabled: false },
  };

  const projectConfig = {
    server,
    authentication: auth.projectAuth,
    authorization: authorization.projectAuthorization,
  };
  const localConfig = { authentication: auth.localAuth };

  validateGeneratedRuntimeConfig(projectConfig, localConfig);

  return {
    projectConfig,
    localConfig,
    summary: [
      `SpecFlow: ${LOCAL_PRODUCT_ORIGIN}`,
      ...auth.summary,
      ...authorization.summary,
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
