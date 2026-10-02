import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';

import { loadRuntimeConfig, type LoadRuntimeConfigOptions } from './config/index.js';
import {
  configureRuntimeApp,
  RUNTIME_FASTIFY_OPTIONS,
  type RuntimeAppDependencies,
} from './server/app.js';

export interface RuntimeStartOptions extends LoadRuntimeConfigOptions {
  readonly dependencies?: RuntimeAppDependencies;
}

export interface RuntimeHandle {
  readonly address: string;
  close(): Promise<void>;
}

export async function startRuntime(options: RuntimeStartOptions = {}): Promise<RuntimeHandle> {
  const loaded = await loadRuntimeConfig(options);
  const app = await createListeningApp(loaded.config, options.cwd ?? process.cwd());

  try {
    await configureRuntimeApp(app, loaded.config, options.dependencies);
    const address = await app.listen({
      host: loaded.config.server.host,
      port: loaded.config.server.port,
    });
    return {
      address,
      close: () => app.close(),
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function createListeningApp(
  config: Awaited<ReturnType<typeof loadRuntimeConfig>>['config'],
  cwd: string,
): Promise<FastifyInstance> {
  if (!config.server.tls.enabled) {
    return Fastify(RUNTIME_FASTIFY_OPTIONS);
  }

  const certFile = config.server.tls.certFile;
  const keyFile = config.server.tls.keyFile;
  if (!certFile || !keyFile) {
    throw new Error('TLS is enabled but certificate files are not configured.');
  }

  const [cert, key] = await Promise.all([
    readFile(resolve(cwd, certFile)),
    readFile(resolve(cwd, keyFile)),
  ]);

  return Fastify({
    ...RUNTIME_FASTIFY_OPTIONS,
    http2: true,
    https: { cert, key, allowHTTP1: true },
  }) as unknown as FastifyInstance;
}
