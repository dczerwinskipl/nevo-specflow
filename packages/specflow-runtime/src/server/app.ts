import cookie from '@fastify/cookie';
import { join } from 'node:path';
import { RuntimeInfoResponseSchema } from '@nevo/specflow-contracts/runtime';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { openWorkflow } from '@nevo/specflow-engine';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerBase,
} from 'fastify';

import { authCookieNames, createAuthFeature, type AuthFeatureDependencies } from '../features/auth';
import type { RuntimeConfig } from '../config/types';
import {
  createSessionsFeature,
  type SessionReferenceOwner,
  type SessionDriver,
} from '../features/sessions';
import {
  createEngineTaskProgress,
  createEngineTaskSources,
  createEngineWorkspaceTasks,
  createTasksFeature,
  type TasksFeatureDependencies,
} from '../features/tasks';
import {
  createDocumentsFeature,
  createEngineWorkspaceDocuments,
  type DocumentsFeatureDependencies,
} from '../features/documents';
import { createWorkflowFeature, type WorkflowFeatureDependencies } from '../features/workflow';
import {
  createDocsFeature,
  openProjectDocumentLookup,
  type DocsFeatureDependencies,
} from '../features/docs';
import { createSettingsFeature } from '../features/settings';
import {
  createEngineAssociationTargets,
  createSessionAssociationsFeature,
  createStoreSessionAssociations,
  createWorkspaceSessionContribution,
  type AssociationTargets,
} from '../features/session-associations';
import {
  composeWorkspaceActivity,
  createSpecsFeature,
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
import { registerOpenApi, registerOpenApiRoute } from './openapi';
import { registerSharedContracts } from './shared-contracts';
import { buildReferencedSchemaSerializer } from './serializer';
import { serializeRuntimeRequest } from './logging';
import { isRequestAtPublicOrigin } from './origin';
import { registerRuntimeWebApp, type RuntimeWebApp } from './web-app';
import { specFlowRoleCapabilities } from './roles';

export interface RuntimeAppDependencies {
  readonly demoEnvironment?: DemoEnvironment;
  readonly dataMode?: 'project' | 'demo';
  /** Enable the demo scenario seam (default off; demo data mode only, ignored otherwise). */
  readonly demoScenarios?: boolean;
  readonly tasks?: TasksFeatureDependencies;
  readonly documents?: DocumentsFeatureDependencies;
  /** Workflow action routes; the Engine of `specs` unless a backend is injected (tests). */
  readonly workflow?: Pick<WorkflowFeatureDependencies, 'port'>;
  /** Project documentation search; the Runtime start supplies the project root in project mode. */
  readonly docs?: DocsFeatureDependencies;
  readonly sessions?: {
    references?: SessionReferenceOwner;
    storage?: { directory: string; projectId: string; workspace?: string };
    driver?: SessionDriver | readonly SessionDriver[];
    /** Engine facts of associated Specifications and Tasks (default: the Engine, project mode). */
    targets?: AssociationTargets;
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
  routerOptions: {
    maxParamLength: 256,
  },
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
  // Each response serializer resolves only the shared contracts it references.
  schemaController: { compilersFactory: { buildSerializer: buildReferencedSchemaSerializer } },
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
  // Before any route: OpenAPI generation captures only routes registered after it.
  await registerOpenApi(app, {
    // Trusted local mode needs no credential; required authentication reads the session cookie.
    sessionCookie:
      config.authentication.mode === 'required'
        ? authCookieNames(config.server.port).session
        : undefined,
  });
  registerSharedContracts(app);

  const mode = dependencies.dataMode ?? 'project';
  const demo =
    mode === 'demo'
      ? createDemoRuntime(
          dependencies.demoEnvironment ??
            createDemoEnvironment({
              showcase: true,
              scenarios: dependencies.demoScenarios === true,
            }),
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
  const engine = dependencies.specs?.engine;
  // Project mode: the Engine's workflow operations, opened per request with the definitions and
  // the project documentation (for `project-document` context references) as they are now.
  const projectDocument = openProjectDocumentLookup(dependencies.docs?.projectRoot, config.docs);
  const taskEngine =
    engine && !demo
      ? {
          engine,
          openWorkflow: () => openWorkflow(engine, { projectDocument: projectDocument() }),
        }
      : undefined;
  const sessionsFeature = createSessionsFeature({
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
    ...(demo
      ? {
          demoList: {
            source: demo.sessionList,
            projectId: demo.environment.state.catalogue.project.id,
          },
          demoReads: demo.managedSessionReads,
        }
      : {}),
  });
  // The association registry: the demo catalogue, or the Session store behind the Engine facts.
  const associationTargets =
    demo?.associationTargets ??
    dependencies.sessions?.targets ??
    createEngineAssociationTargets(
      engine,
      dependencies.tasks?.definitions ??
        (taskEngine ? createEngineTaskSources(taskEngine).definitions : undefined),
    );
  const associations =
    demo?.sessionReferences ??
    createStoreSessionAssociations(sessionsFeature.runtime, associationTargets);
  const sessionReferences: SessionReferenceOwner =
    (demo ? undefined : dependencies.sessions?.references) ?? associations;
  // Demo mode serves the real document read routes from the demo directories.
  const documentReadSource = dependencies.documents?.readSource ?? demo?.documentReadSource;
  // The Runtime's single project: every `spec.*` check runs at `specScope(projectId, specId)`.
  const projectId = () =>
    demo
      ? demo.environment.state.catalogue.project.id
      : (engine?.context.project.projectId ?? dependencies.sessions?.storage?.projectId);
  // Project mode: the Engine is the source of the workspace `tasks` (the Task resources and runs)
  // and `documents` sections, the Session association registry of the `sessions`
  // section, and both feed the partial `activity` history, unless a contribution was injected (tests).
  const specContributions = dependencies.specs?.contributions ?? demo?.contributions;
  const contributions = demo
    ? specContributions
    : {
        ...specContributions,
        ...(taskEngine && !specContributions?.tasks
          ? { tasks: createEngineWorkspaceTasks(taskEngine) }
          : {}),
        ...(engine && !specContributions?.documents
          ? { documents: createEngineWorkspaceDocuments(engine) }
          : {}),
        ...(!specContributions?.activity
          ? {
              activity: (_specId: string, input: Parameters<typeof composeWorkspaceActivity>[0]) =>
                Promise.resolve(composeWorkspaceActivity(input)),
            }
          : {}),
        ...(!specContributions?.sessions
          ? {
              sessions: createWorkspaceSessionContribution({
                sessions: sessionsFeature.runtime,
                projectId,
              }),
            }
          : {}),
      };
  const productFeatures: readonly RuntimeFeature[] = [
    createSpecsFeature({
      ...(config.specs ? { config: config.specs } : {}),
      dependencies: {
        engine: dependencies.specs?.engine,
        overviewRepository: dependencies.specs?.overviewRepository ?? demo?.overviewRepository,
        workspaceRepository: dependencies.specs?.workspaceRepository ?? demo?.workspaceRepository,
        contributions,
        ...(taskEngine ? { taskProgress: createEngineTaskProgress(taskEngine) } : {}),
        sessions: sessionReferences,
        projectId,
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
      ...(taskEngine ? { engine: taskEngine } : {}),
      ...dependencies.tasks,
      sessions: dependencies.tasks?.sessions ?? sessionReferences,
      projectId,
    }),
    createDocumentsFeature({
      ...(documentReadSource ? { readSource: documentReadSource } : {}),
      ...(engine ? { engine } : {}),
      projectId,
      // The demo emulates the writes under `/api/demo/...`; the real write routes are project-only.
      ...(demo ? { writeRoutes: false } : {}),
      operations: {
        registry: progressRegistry,
        ...(dependencies.operations?.now ? { now: dependencies.operations.now } : {}),
      },
      ...(dependencies.documents?.writeSource
        ? { writeSource: dependencies.documents.writeSource }
        : {}),
      ...(dependencies.documents?.taskDocuments
        ? { taskDocuments: dependencies.documents.taskDocuments }
        : {}),
    }),
    createWorkflowFeature({
      ...(engine ? { engine } : {}),
      ...(taskEngine ? { openWorkflow: taskEngine.openWorkflow } : {}),
      ...dependencies.workflow,
      // The demo Runtime has no Engine and serves no workflow routes.
      ...(demo ? { routes: false } : {}),
      projectId,
    }),
    sessionsFeature,
    createSessionAssociationsFeature({
      associations,
      targets: associationTargets,
      projectId,
      // Demo mode reads associations from the catalogue; it has no composed create.
      ...(demo ? {} : { sessions: sessionsFeature.runtime }),
    }),
    createSettingsFeature(),
    createDocsFeature({
      ...(config.docs ? { configuration: config.docs } : {}),
      // Demo data serves no project documentation.
      ...(dependencies.docs && !demo ? { dependencies: dependencies.docs } : {}),
    }),
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
      config: { openApiPublic: true },
      schema: {
        tags: ['Runtime'],
        summary: 'Read the Runtime data mode',
        response: { 200: RuntimeInfoResponseSchema },
      },
    },
    (_request, reply) => {
      reply.header('Cache-Control', 'no-store');

      return {
        dataMode: mode,
      };
    },
  );
  registerOpenApiRoute(app);

  for (const feature of productFeatures) {
    await feature.register?.(app);
  }

  if (demo) {
    registerDemoRoutes(app, demo, { registry: progressRegistry, stream: progressStream });
  }

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
