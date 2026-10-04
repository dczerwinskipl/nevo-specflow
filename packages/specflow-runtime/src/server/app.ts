import cookie from '@fastify/cookie';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerBase,
} from 'fastify';

import { authFeature, type AuthFeatureDependencies } from '../auth/index';
import type { RuntimeConfig } from '../config/types';
import { serializeRuntimeRequest } from './logging';

export interface RuntimeAppDependencies {
  readonly auth?: AuthFeatureDependencies;
}

export const RUNTIME_FASTIFY_OPTIONS = {
  logger: {
    level: 'warn',
    stream: process.stderr,
    serializers: {
      req: serializeRuntimeRequest,
    },
  },
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

  app.get('/', (_request, reply) => {
    if (config.server.publicOrigin) {
      return reply.redirect(config.server.publicOrigin);
    }
    return {
      service: 'Nevo SpecFlow Runtime API',
      status: 'ok',
      message: 'This address serves the Runtime API, not the SpecFlow web UI.',
    };
  });

  await app.register(authFeature, {
    auth: config.auth,
    ...(config.authorization ? { authorization: config.authorization } : {}),
    ...(config.server.publicOrigin ? { publicOrigin: config.server.publicOrigin } : {}),
    serverPort: config.server.port,
    secureCookies: config.server.tls.enabled,
    ...(dependencies.auth ? { dependencies: dependencies.auth } : {}),
  });
}
