import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  DOCUMENT_SHUTDOWN_DEADLINE_MS,
  createDocumentQueueScheduler,
  disabledDocumentQueueScheduler,
  releaseAbandonedProjectControlLock,
  setProcessStartTimeSource,
  type DocumentQueueScheduler,
} from '@nevo/specflow-engine';
import Fastify, { type FastifyInstance, type RawServerBase } from 'fastify';

import { loadRuntimeConfig, type LoadRuntimeConfigOptions } from './config/index';
import { windowsProcessCreation } from './features/sessions/providers/process/windows-process';
import type { RuntimeConfig } from './config/types';
import {
  configureRuntimeApp,
  RUNTIME_FASTIFY_OPTIONS,
  type RuntimeAppDependencies,
} from './server/app';

export interface RuntimeStartOptions extends LoadRuntimeConfigOptions {
  readonly projectRoot: string;
  readonly demo?: boolean;
  /** With `demo`: accept the `demoScenario` seam (default off; isolated scenario environments only). */
  readonly demoScenarios?: boolean;
  readonly dependencies?: RuntimeAppDependencies;
  /** The document commit scheduler of a project Runtime. */
  readonly documentQueue?: {
    /** Replaces the Engine scheduler; the value false runs the Runtime without one (tests). */
    readonly scheduler?: DocumentQueueScheduler | false;
    /** How long shutdown may spend committing what is queued (default 10 s). */
    readonly shutdownDeadlineMs?: number;
  };
}

export interface RuntimeHandle {
  readonly address: string;
  close(): Promise<void>;
}

export async function startRuntime(options: RuntimeStartOptions): Promise<RuntimeHandle> {
  // Windows has no procfs: the Engine's executor and lock owner records carry the process creation
  // time read here (the native-stop evidence), so a reused PID is told apart from its holder.
  if (process.platform === 'win32') {
    setProcessStartTimeSource(windowsProcessCreation);
  }

  const loaded = await loadRuntimeConfig(options);
  const app = await createListeningApp(loaded.config, options.projectRoot, {
    ...options.dependencies,
    ...(options.demo
      ? { dataMode: 'demo' as const, ...(options.demoScenarios ? { demoScenarios: true } : {}) }
      : {}),
  });

  // Project mode only: the demo Runtime has no Engine and nothing to commit.
  const engine = options.demo ? undefined : options.dependencies?.specs?.engine;
  const scheduler =
    options.documentQueue?.scheduler === false || engine === undefined
      ? disabledDocumentQueueScheduler
      : (options.documentQueue?.scheduler ?? createDocumentQueueScheduler(engine));
  try {
    if (engine) {
      // A Runtime or CLI that died holding the Project Home control lock leaves it behind; it is
      // released here only on positive evidence that its holder is gone (ADR 0027), before the
      // startup passes that need it. A live or unknown holder is kept and logged.
      const lock = await releaseAbandonedProjectControlLock(engine.context).catch(
        (error: unknown) => ({ status: 'error' as const, error }),
      );
      if (lock.status === 'released') {
        app.log.warn({ holder: lock.holder }, 'Released the control lock of a stopped process');
      } else if (lock.status === 'kept') {
        app.log.warn(
          { reason: lock.reason },
          lock.reason === 'holder-alive' || lock.reason === 'held-by-this-process'
            ? 'The project control lock is held by a running process'
            : 'The project control lock cannot be proven abandoned; stop every SpecFlow process of this project and run `nevo-specflow specs documents recover --confirmed-stopped`',
        );
      } else if (lock.status === 'error') {
        app.log.warn({ err: lock.error }, 'The project control lock could not be inspected');
      }
    }

    const address = await app.listen({
      host: loaded.config.server.host,
      port: loaded.config.server.port,
    });
    // The startup pass resumes interrupted work in the background; it never delays the listener.
    void scheduler.start();

    return {
      address,
      // The server stops first (requests in flight finish, so their writes are queued), then the
      // scheduler commits what is queued within the deadline. What does not finish stays journaled.
      close: async () => {
        try {
          await app.close();
        } finally {
          await scheduler.stop({
            flush: true,
            deadlineMs: options.documentQueue?.shutdownDeadlineMs ?? DOCUMENT_SHUTDOWN_DEADLINE_MS,
          });
        }
      },
    };
  } catch (error) {
    await app.close();

    throw error;
  }
}

async function createListeningApp(
  config: RuntimeConfig,
  cwd: string,
  dependencies: RuntimeAppDependencies | undefined,
) {
  if (!config.server.tls.enabled) {
    return configureOrClose(Fastify(RUNTIME_FASTIFY_OPTIONS), config, dependencies);
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

  return configureOrClose(
    Fastify({
      ...RUNTIME_FASTIFY_OPTIONS,
      http2: true,
      https: { cert, key, allowHTTP1: true },
    }),
    config,
    dependencies,
  );
}

async function configureOrClose<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies | undefined,
): Promise<FastifyInstance<RawServer>> {
  try {
    await configureRuntimeApp(app, config, dependencies);

    return app;
  } catch (error) {
    await app.close();

    throw error;
  }
}
