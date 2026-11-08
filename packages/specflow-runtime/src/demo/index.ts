import type { FastifyInstance, RawServerBase } from 'fastify';
import {
  createDemoDocumentReadSource,
  createDemoDocuments,
  registerDemoDocumentRoutes,
} from '../features/documents';
import {
  createDemoSessionReferences,
  createDemoSessions,
  registerDemoSessionRoutes,
} from '../features/sessions';
import { createDemoAssociationTargets } from '../features/session-associations';
import {
  createDemoSpecs,
  createDemoSpecsRepositories,
  registerDemoSpecRoutes,
} from '../features/specs';
import { createDemoTaskSources } from '../features/tasks';
import type { DemoProgress } from '../features/specs/demo/endpoints';
import { createDemoState, type DemoStateOptions } from './state';

export { DemoOperationError, type DemoFailureStage, type DemoState } from './state';

export interface DemoEnvironmentOptions extends DemoStateOptions {
  /** Seed synthetic showcase content (nested document tree) used by the demo server. */
  showcase?: boolean;
  /** Simulated commit latency of every document write, in ms (default 0). */
  documentCommitLatencyMs?: number;
}

/**
 * One demo environment per Runtime: a single shared in-memory state plus the operations of each
 * owning module (documents, sessions, specs) built over it.
 */
export function createDemoEnvironment(options: DemoEnvironmentOptions = {}) {
  const state = createDemoState(options);
  const sessions = createDemoSessions(state);
  const documents = createDemoDocuments(state, {
    showcase: options.showcase === true,
    ...(options.documentCommitLatencyMs !== undefined
      ? { commitLatencyMs: options.documentCommitLatencyMs }
      : {}),
    onPathsChanged: (specId, paths) => sessions.refreshDocuments(specId, paths),
  });
  const specs = createDemoSpecs(state, documents);

  return { state, documents, sessions, specs };
}

export type DemoEnvironment = ReturnType<typeof createDemoEnvironment>;

/**
 * Wires the demo environment into the Runtime: read-side repositories and sources handed to the
 * feature modules, plus the demo-only routes. The seeded catalogue (with the Sessions allocated
 * in this environment) is the Session association registry.
 */
export function createDemoRuntime(environment: DemoEnvironment) {
  const { state, documents, sessions } = environment;
  const repositories = createDemoSpecsRepositories({ state, documents, sessions });
  const sessionReferences = sessions.overlayReferences(
    createDemoSessionReferences(repositories.catalogue),
  );
  const taskSources = createDemoTaskSources(repositories.catalogue);

  return {
    environment,
    ...repositories,
    sessionReferences,
    sessionList: sessions.list(repositories.catalogue),
    associationTargets: createDemoAssociationTargets({
      catalogue: repositories.catalogue,
      isArchived: async (specId) =>
        (await repositories.overviewRepository.readArchive()).items.some(
          (item) => item.id === specId,
        ),
      ...(taskSources.definitions ? { definitions: taskSources.definitions } : {}),
    }),
    documentReadSource: createDemoDocumentReadSource(documents, repositories.catalogue),
    taskSources,
  };
}

export type DemoRuntime = ReturnType<typeof createDemoRuntime>;

/** Registers every demo-only route (`/api/demo/**`), each owned by its feature module. */
export function registerDemoRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  demo: DemoRuntime,
  progress?: DemoProgress,
) {
  const { state, documents, sessions, specs } = demo.environment;
  registerDemoSpecRoutes(app, state, specs, demo.catalogue, progress);
  registerDemoSessionRoutes(app, {
    state,
    sessions,
    catalogue: demo.catalogue,
    references: demo.sessionReferences,
    documentPaths: documents.pathsFor,
  });
  registerDemoDocumentRoutes(app, documents, demo.catalogue, state.catalogue.project.id);
}
