import cookie from '@fastify/cookie';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerBase,
} from 'fastify';

import { authFeature, type AuthFeatureDependencies } from '../auth/index.js';
import type { RuntimeConfig } from '../config/types.js';

export interface RuntimeAppDependencies {
  readonly auth?: AuthFeatureDependencies;
}

export const RUNTIME_FASTIFY_OPTIONS = {
  logger: false,
  ajv: {
    customOptions: {
      coerceTypes: false,
      removeAdditional: false,
    },
  },
} satisfies FastifyServerOptions;

export async function createRuntimeApp(
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify(RUNTIME_FASTIFY_OPTIONS);
  await configureRuntimeApp(app, config, dependencies);
  return app;
}

export async function configureRuntimeApp<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies = {},
): Promise<void> {
  await app.register(cookie);
  await app.register(authFeature, {
    auth: config.auth,
    ...(config.server.publicOrigin ? { publicOrigin: config.server.publicOrigin } : {}),
    secureCookies: config.server.tls.enabled,
    ...(dependencies.auth ? { dependencies: dependencies.auth } : {}),
  });
}
