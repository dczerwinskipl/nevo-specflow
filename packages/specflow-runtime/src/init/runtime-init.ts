import { initAuth, type AuthInitOptions } from '../auth/authentication/init';
import {
  assertNoLocalAuthorization,
  validateProjectAuthorizationSource,
} from '../auth/authorization/config-source';
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

  const host = '127.0.0.1';
  const port = 4318;
  const publicOrigin = auth.requiresPublicOrigin ? await askBrowserOrigin(options.ui) : undefined;
  const authorization = await initAuthorization(options.ui, auth.users);

  const server: Record<string, unknown> = {
    host,
    port,
    ...(publicOrigin ? { publicOrigin } : {}),
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
      ...(publicOrigin ? [`Browser origin: ${publicOrigin}`] : []),
      ...auth.summary,
      ...authorization.summary,
    ],
  };
}

async function askBrowserOrigin(ui: RuntimeSetupUi): Promise<string> {
  const defaultOrigin = 'http://127.0.0.1:5173';

  while (true) {
    const value = (await ui.input('Browser origin for OIDC callbacks', defaultOrigin)).trim();

    try {
      const url = new URL(value);
      if (
        url.protocol === 'http:' &&
        isLoopbackHost(url.hostname) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      ) {
        return url.origin;
      }
    } catch {
      // Report the same user-facing validation below.
    }

    ui.note(
      'Enter an absolute loopback HTTP origin without a path, query, or fragment. The default matches the SpecFlow Vite dev server.',
      'Browser origin',
    );
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  const parts = normalized.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)
  );
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
