import compress from '@fastify/compress';
import type { AgentStepOrigin } from '@nevo/specflow-contracts/sessions';
import cookie from '@fastify/cookie';
import { RuntimeInfoResponseSchema } from '@nevo/specflow-contracts/runtime';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { openAgentAttempts, openWorkflow, withCheckoutQuiescence } from '@nevo/specflow-engine';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RawServerBase,
} from 'fastify';

import {
  authCookieNames,
  createAuthFeature,
  type AuthFeatureDependencies,
  type RequestAuthorization,
} from '../features/auth';
import type { RuntimeConfig } from '../config/types';
import {
  checkoutSessions,
  createSessionsFeature,
  type AgentStepOrigins,
  type SessionsRuntime,
  projectSessionStoreDirectory,
  runtimeCheckoutQuiescence,
  type SessionReferenceOwner,
  type SessionDriver,
} from '../features/sessions';
import {
  createEngineOverviewExecution,
  createEngineTaskSources,
  createProjectTaskEngine,
  createEngineWorkspaceTasks,
  createTasksFeature,
  type TasksFeatureDependencies,
} from '../features/tasks';
import {
  createDocumentsFeature,
  createEngineWorkspaceDocuments,
  type DocumentsFeatureDependencies,
} from '../features/documents';
import {
  createWorkflowFeature,
  demoAgentAvailability,
  type WorkflowFeatureDependencies,
} from '../features/workflow';
import {
  agentStepOrigins,
  agentStepTitle,
  createAgentExecutionFeature,
  createUnavailableAgentStepExecutionFeature,
  shownSessionTitle,
} from '../features/agent-execution';
import {
  createDocsFeature,
  openProjectDocumentLookup,
  type DocsFeatureDependencies,
} from '../features/docs';
import { createSettingsFeature } from '../features/settings';
import { createWorkspaceOccupancy, createWorkspacesFeature } from '../features/workspaces';
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
  releaseAfterQuiescence,
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
    /** Agent step origins of Sessions (default: the Engine's attempt records, project mode). */
    agentStepOrigins?: AgentStepOrigins;
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
  // Only the built UI is compressed. API, including SSE, keeps its existing behavior.
  await app.register(compress, { global: false, encodings: ['br', 'gzip'] });
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
  // The demo workflow is built and seeded before anything is served: a demo that cannot be seeded
  // does not start (never a Runtime that answers 404s for its own catalogue).
  await demo?.start();
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
  const docsFeature = createDocsFeature({
    ...(config.docs ? { configuration: config.docs } : {}),
    // Demo data serves no project documentation.
    ...(dependencies.docs && !demo ? { dependencies: dependencies.docs } : {}),
    // `docs.view` is checked at the Engine's project; without an Engine the docs routes answer 503.
    projectId: () => engine?.context.project.projectId,
    ...(engine && !demo ? { engine } : {}),
  });
  // Project mode: the Engine's workflow operations, opened per request with the definitions and
  // the documentation of each Specification's checkout (for `project-document` context
  // references) as they are now.
  const projectDocument = openProjectDocumentLookup(docsFeature.activeDocumentIds);
  // Demo mode: the same operations over the demo's in-memory workflow state.
  const taskEngine =
    demo?.taskEngine ??
    (engine
      ? createProjectTaskEngine(engine, () =>
          openWorkflow(engine, { projectDocument: projectDocument() }),
        )
      : undefined);
  // Which checkouts agent Session Turns work in: Close never removes one of them (and holds a
  // checkout against new Turns while it removes it).
  const workspaceOccupancy = createWorkspaceOccupancy();
  // Project mode: a write Turn of a Specification's Session gets an invocation capability and
  // writes through the local agent broker (D11).
  // Agent step execution: the Session coordinator is read at request time (the Sessions feature owns it).
  const sessionsHolder: { runtime?: SessionsRuntime } = {};
  const agentExecution =
    mode === 'project' && engine
      ? createAgentExecutionFeature({
          engine,
          projectDocument,
          coordinator: () => sessionsHolder.runtime?.coordinator,
          projectId: () => engine.context.project.projectId,
        })
      : undefined;
  const sessionsFeature = createSessionsFeature({
    ...(engine ? { engine } : {}),
    ...(dependencies.sessions?.agentStepOrigins
      ? { agentStepOrigins: dependencies.sessions.agentStepOrigins }
      : mode === 'project' && taskEngine
        ? {
            agentStepOrigins: (specId: string) => agentStepOrigins(taskEngine.openWorkflow, specId),
          }
        : {}),
    workspaceOccupancy,
    ...(agentExecution
      ? {
          invocationCapabilities: agentExecution.capabilities,
          settleAgentAttempt: agentExecution.settleAgentAttempt,
          agentTurns: agentExecution.agentTurns,
        }
      : {}),
    config: mode === 'project' ? config.sessions : undefined,
    storage:
      dependencies.sessions?.storage ??
      (mode === 'project' && config.sessions?.enabled && engine
        ? {
            directory: projectSessionStoreDirectory(engine),
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
  sessionsHolder.runtime = sessionsFeature.runtime;
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
  // Demo mode serves the real document read routes from the demo directories, and the real Task
  // document routes from the demo Tasks.
  const documentReadSource = dependencies.documents?.readSource ?? demo?.documentReadSource;
  const taskDocuments = dependencies.documents?.taskDocuments ?? demo?.taskDocuments;
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
                ...(taskEngine
                  ? {
                      agentSteps: {
                        origins: (specId: string) =>
                          agentStepOrigins(taskEngine.openWorkflow, specId),
                        title: (stored: string | undefined, origin: AgentStepOrigin) =>
                          shownSessionTitle(stored, agentStepTitle(origin)),
                      },
                    }
                  : {}),
              }),
            }
          : {}),
      };
  // Create's "then run the first step with this agent" is started by agent step execution.
  const firstStepStarter = dependencies.specs?.firstStepStarter ?? agentExecution?.firstStepStarter;
  // Bound once the auth feature exists (it is composed after the product features it authorizes).
  const principals: {
    authorize?: (principal: string) => RequestAuthorization | undefined;
  } = {};
  const productFeatures: readonly RuntimeFeature[] = [
    createSpecsFeature({
      ...(config.specs ? { config: config.specs } : {}),
      dependencies: {
        authorizePrincipal: (principal) => principals.authorize?.(principal),
        // Close asks whether an agent can work in a checkout it removes: this Runtime's own Turns
        // while it owns the Session store, else the store's owner record.
        engine:
          engine &&
          withCheckoutQuiescence(
            engine,
            runtimeCheckoutQuiescence({
              engine,
              sessions: sessionsFeature.runtime,
              runningSessions: (workspaceId) => workspaceOccupancy.runningSessions(workspaceId),
            }),
          ),
        overviewRepository: dependencies.specs?.overviewRepository ?? demo?.overviewRepository,
        workspaceRepository: dependencies.specs?.workspaceRepository ?? demo?.workspaceRepository,
        contributions,
        ...(taskEngine
          ? { overviewExecution: createEngineOverviewExecution(taskEngine, app.log) }
          : {}),
        sessions: sessionReferences,
        projectId,
        // Create's first-step intent: the Runtime starts the first step with an agent after Create.
        ...(firstStepStarter ? { firstStepStarter } : {}),
        // Close deletes a checkout only after the documentation index there is released (E9).
        releaseWorkspace: releaseAfterQuiescence(
          workspaceOccupancy,
          docsFeature.releaseWorkspaceDocs,
        ),
        ...(engine
          ? {
              runningSessions: checkoutSessions({
                engine,
                sessions: sessionsFeature.runtime,
                runningSessions: (workspaceId) => workspaceOccupancy.runningSessions(workspaceId),
              }),
            }
          : {}),
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
      ...(taskDocuments ? { taskDocuments } : {}),
    }),
    createWorkflowFeature({
      ...(taskEngine ? { openWorkflow: taskEngine.openWorkflow } : {}),
      // What only the Runtime knows of the agent option; the demo runs no agent.
      ...(agentExecution
        ? {
            agentAvailability: agentExecution.agentAvailability,
            agentReturn: agentExecution.agentStepExecution.returnStep,
          }
        : demo
          ? { agentAvailability: demoAgentAvailability }
          : {}),
      // Retry commit acts on the Project Home's agent attempts; the demo Runtime has none.
      ...(engine && !demo ? { openAgentAttempts: () => openAgentAttempts(engine) } : {}),
      ...dependencies.workflow,
      projectId,
    }),
    sessionsFeature,
    // Without an Engine the agent step execution routes answer 503, like the workflow routes.
    agentExecution ?? createUnavailableAgentStepExecutionFeature(),
    createSessionAssociationsFeature({
      associations,
      targets: associationTargets,
      projectId,
      // Demo mode reads associations from the catalogue; it has no composed create.
      ...(demo ? {} : { sessions: sessionsFeature.runtime }),
    }),
    createSettingsFeature(),
    createWorkspacesFeature({
      ...(engine ? { engine } : {}),
      // Demo data lists the demo workspace registry over the same route.
      ...(demo ? { source: demo.workspaceList } : {}),
      projectId,
    }),
    docsFeature,
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

  principals.authorize = (principal) => authFeature.authorizePrincipal(principal);
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
