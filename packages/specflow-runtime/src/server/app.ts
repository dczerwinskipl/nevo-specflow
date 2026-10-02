import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerAuthFeature, type AuthFeatureDependencies } from '../auth/routes.js';
import type { RuntimeConfig } from '../config/types.js';

export type RuntimeAppDependencies = AuthFeatureDependencies;

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

export async function configureRuntimeApp(
  app: FastifyInstance,
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies = {},
): Promise<void> {
  await app.register(cookie);
  registerAuthFeature(app, config, dependencies);
}
