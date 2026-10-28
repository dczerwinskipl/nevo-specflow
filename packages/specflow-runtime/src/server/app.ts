import cookie from '@fastify/cookie';
import { join } from 'node:path';
import { RuntimeInfoResponseSchema } from '@nevo/specflow-contracts/runtime';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { CapabilityId } from '@nevo/authorization';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerBase,
} from 'fastify';

import {
  createAuthFeature,
  type AuthFeatureDependencies,
  type SpecFlowRoleId,
} from '../features/auth';
import type { RuntimeConfig } from '../config/types';
import {
  createSessionsFeature,
  SessionCapabilities,
  type SessionReferenceOwner,
  type SessionDriver,
} from '../features/sessions';
import { createTasksFeature, type TasksFeatureDependencies } from '../features/tasks';
import {
  createDocumentsFeature,
  createEngineWorkspaceDocuments,
  type DocumentsFeatureDependencies,
} from '../features/documents';
import { createSettingsFeature, SettingsCapabilities } from '../features/settings';
import {
  createSpecsFeature,
  SpecCapabilities,
  ProjectGitCapabilities,
  type SpecsFeatureDependencies,
} from '../features/specs';
import {
  createDemoEnvironment,
  createDemoRuntime,
  registerDemoRoutes,
  type DemoEnvironment,
} from '../demo';
import {
  createOperationProgressRegistry,
  type OperationEventsStreamOptions,
  type OperationProgressRegistry,
} from '../features/operations';
import type { RuntimeFeature } from '../features/runtime-feature';
import { registerRuntimeErrorHandler } from './error-handler';
import { registerEndpointPolicy } from './endpoint-policy';
import { serializeRuntimeRequest } from './logging';
import { isRequestAtPublicOrigin } from './origin';
import { registerRuntimeWebApp, type RuntimeWebApp } from './web-app';

export interface RuntimeAppDependencies {
  readonly demoEnvironment?: DemoEnvironment;
  readonly dataMode?: 'project' | 'demo';
  /** Enable the demo scenario seam (default off; demo data mode only, ignored otherwise). */
  readonly demoScenarios?: boolean;
  readonly tasks?: TasksFeatureDependencies;
  readonly documents?: DocumentsFeatureDependencies;
  readonly sessions?: {
    references?: SessionReferenceOwner;
    storage?: { directory: string; projectId: string; workspace?: string };
    driver?: SessionDriver | readonly SessionDriver[];
  };
  readonly auth?: AuthFeatureDependencies;
  readonly specs?: SpecsFeatureDependencies;
  readonly webApp?: RuntimeWebApp;
  /** Generic long-running operation progress (SSE). Injectable for tests. */
  readonly operations?: {
    readonly registry?: OperationProgressRegistry;
    readonly heartbeatMs?: number;
    readonly waitMs?: number;
    readonly maxStreams?: number;
    readonly maxStreamsPerPrincipal?: number;
    readonly maxWaiting?: number;
    /** Injectable clock and idle threshold of the operation status derivation (tests). */
    readonly now?: () => Date;
    readonly staleAfterMs?: number;
  };
}

export const RUNTIME_FASTIFY_OPTIONS = {
  // Above the longest schema-legal path parameter (a 200 character id), so the schema answers 404 or
  // 400 instead of the router answering 414 FST_ERR_MAX_PARAM_LENGTH (Fastify's default is 100).
  maxParamLength: 256,
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
  registerRuntimeErrorHandler(app);
  await registerEndpointPolicy(app, config.server.rateLimit);

  const mode = dependencies.dataMode ?? 'project';
  const demo =
    mode === 'demo'
      ? createDemoRuntime(
          dependencies.demoEnvironment ??
            createDemoEnvironment({
              showcase: true,
              scenarios: dependencies.demoScenarios === true,
            }),
          { references: dependencies.sessions?.references },
        )
      : undefined;
  const progressRegistry = dependencies.operations?.registry ?? createOperationProgressRegistry();
  const progressStream: OperationEventsStreamOptions = {
    ...(dependencies.operations?.heartbeatMs !== undefined
      ? { heartbeatMs: dependencies.operations.heartbeatMs }
      : {}),
    ...(dependencies.operations?.waitMs !== undefined
      ? { waitMs: dependencies.operations.waitMs }
      : {}),
    ...(dependencies.operations?.maxStreams !== undefined
      ? { maxStreams: dependencies.operations.maxStreams }
      : {}),
    ...(dependencies.operations?.maxStreamsPerPrincipal !== undefined
      ? { maxStreamsPerPrincipal: dependencies.operations.maxStreamsPerPrincipal }
      : {}),
    ...(dependencies.operations?.maxWaiting !== undefined
      ? { maxWaiting: dependencies.operations.maxWaiting }
      : {}),
  };
  const sessionReferences: SessionReferenceOwner | undefined =
    demo?.sessionReferences ?? dependencies.sessions?.references;
  // Demo mode serves the real document read routes from the demo directories.
  const documentReadSource = dependencies.documents?.readSource ?? demo?.documentReadSource;
  // Project mode: the Engine is the source of the workspace `documents` section, unless a
  // contribution was injected (tests, demo).
  const engine = dependencies.specs?.engine;
  const specContributions = dependencies.specs?.contributions ?? demo?.contributions;
  const contributions =
    !demo && engine && !specContributions?.documents
      ? { ...specContributions, documents: createEngineWorkspaceDocuments(engine) }
      : specContributions;
  const productFeatures: readonly RuntimeFeature[] = [
    createSpecsFeature({
      ...(config.specs ? { config: config.specs } : {}),
      dependencies: {
        engine: dependencies.specs?.engine,
        overviewRepository: dependencies.specs?.overviewRepository ?? demo?.overviewRepository,
        workspaceRepository: dependencies.specs?.workspaceRepository ?? demo?.workspaceRepository,
        contributions,
        sessions: sessionReferences,
        // The demo Runtime serves its own Create routes (and events route) below.
        ...(demo
          ? {}
          : {
              progress: {
                registry: progressRegistry,
                stream: progressStream,
                ...(dependencies.operations?.now ? { now: dependencies.operations.now } : {}),
                ...(dependencies.operations?.staleAfterMs !== undefined
                  ? { staleAfterMs: dependencies.operations.staleAfterMs }
                  : {}),
              },
            }),
      },
    }),
    createTasksFeature({
      ...(demo ? demo.taskSources : {}),
      ...dependencies.tasks,
      sessions: dependencies.tasks?.sessions ?? sessionReferences,
    }),
    createDocumentsFeature({
      ...(documentReadSource ? { readSource: documentReadSource } : {}),
      ...(engine ? { engine } : {}),
    }),
    createSessionsFeature({
      ...(engine ? { engine } : {}),
      config: mode === 'project' ? config.sessions : undefined,
      storage:
        dependencies.sessions?.storage ??
        (mode === 'project' && config.sessions?.enabled && engine
          ? {
              directory: join(engine.context.project.stateRoot, 'sessions'),
              projectId: engine.context.project.projectId,
              workspace: engine.context.workspace.root,
            }
          : undefined),
      driver: dependencies.sessions?.driver,
    }),
    createSettingsFeature(),
  ];

  const authFeature = createAuthFeature({
    authentication: config.authentication,
    ...(config.authorization ? { authorization: config.authorization } : {}),
    authorizationResources: productFeatures.flatMap((feature) => feature.authorizationResources),
    roles: specFlowRoleCapabilities(),
    ...(config.server.publicOrigin ? { publicOrigin: config.server.publicOrigin } : {}),
    serverPort: config.server.port,
    secureCookies: config.server.tls.enabled,
    ...(dependencies.auth ? { dependencies: dependencies.auth } : {}),
  });

  await authFeature.register(app);

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/runtime/info',
    {
      schema: { response: { 200: RuntimeInfoResponseSchema } },
    },
    (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        dataMode: mode,
      };
    },
  );

  for (const feature of productFeatures) {
    await feature.register?.(app);
  }

  if (demo) registerDemoRoutes(app, demo, { registry: progressRegistry, stream: progressStream });

  if (dependencies.webApp) {
    registerRuntimeWebApp(app, dependencies.webApp);
    return;
  }

  app.get('/', (request, reply) => {
    if (
      config.server.publicOrigin &&
      !isRequestAtPublicOrigin(config.server.publicOrigin, request.host, config.server.tls.enabled)
    ) {
      return reply.redirect(config.server.publicOrigin);
    }

    return {
      service: 'Nevo SpecFlow Runtime API',
      status: 'ok',
      message: 'This address serves the Runtime API, not the SpecFlow web UI.',
    };
  });
}

function specFlowRoleCapabilities(): Readonly<Record<SpecFlowRoleId, readonly CapabilityId[]>> {
  const viewer = [
    SpecCapabilities.capabilities.View,
    SessionCapabilities.capabilities.View,
  ] as const;

  const developer = [
    ...viewer,
    SpecCapabilities.capabilities.Create,
    SpecCapabilities.capabilities.Manage,
    SpecCapabilities.capabilities.CloseWorktree,
    SpecCapabilities.capabilities.CloseSpecification,
    SessionCapabilities.capabilities.Create,
    SessionCapabilities.capabilities.Manage,
    SessionCapabilities.capabilities.ExecuteWrite,
  ] as const;

  return {
    viewer,
    developer,
    admin: [
      ...developer,
      SettingsCapabilities.capabilities.View,
      SettingsCapabilities.capabilities.Manage,
      ProjectGitCapabilities.capabilities.Integrate,
      ProjectGitCapabilities.capabilities.CloseWorkspace,
    ],
  };
}
