import cookie from '@fastify/cookie';
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
} from '../features/sessions';
import { createTasksFeature, type TasksFeatureDependencies } from '../features/tasks';
import { createDocumentsFeature, type DocumentsFeatureDependencies } from '../features/documents';
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
  readonly sessions?: { references?: SessionReferenceOwner };
  readonly auth?: AuthFeatureDependencies;
  readonly specs?: SpecsFeatureDependencies;
  readonly webApp?: RuntimeWebApp;
  /** Generic long-running operation progress (SSE). Injectable for tests. */
  readonly operations?: {
    readonly registry?: OperationProgressRegistry;
    readonly heartbeatMs?: number;
    readonly waitMs?: number;
  };
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
          {
            references: dependencies.sessions?.references,
            documentSource: dependencies.documents?.source,
          },
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
  };
  const sessionReferences: SessionReferenceOwner | undefined =
    demo?.sessionReferences ?? dependencies.sessions?.references;
  const documentSource = demo?.documentSource ?? dependencies.documents?.source;
  const productFeatures: readonly RuntimeFeature[] = [
    createSpecsFeature({
      ...(config.specs ? { config: config.specs } : {}),
      dependencies: {
        engine: dependencies.specs?.engine,
        overviewRepository: dependencies.specs?.overviewRepository ?? demo?.overviewRepository,
        workspaceRepository: dependencies.specs?.workspaceRepository ?? demo?.workspaceRepository,
        contributions: dependencies.specs?.contributions ?? demo?.contributions,
        sessions: sessionReferences,
        // The demo Runtime serves its own Create routes (and events route) below.
        ...(demo ? {} : { progress: { registry: progressRegistry, stream: progressStream } }),
      },
    }),
    createTasksFeature({
      ...(demo ? demo.taskSources : {}),
      ...dependencies.tasks,
      sessions: dependencies.tasks?.sessions ?? sessionReferences,
    }),
    createDocumentsFeature({
      source: documentSource,
    }),
    createSessionsFeature(),
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
