import type { FastifyInstance, RawServerBase } from 'fastify';
import {
  createDemoDocuments,
  createDemoDocumentSource,
  registerDemoDocumentRoutes,
  type DocumentContentSource,
} from '../features/documents';
import {
  createDemoSessionReferences,
  createDemoSessions,
  registerDemoSessionRoutes,
  type SessionReferenceOwner,
} from '../features/sessions';
import {
  createDemoSpecs,
  createDemoSpecsRepositories,
  registerDemoSpecRoutes,
} from '../features/specs';
import { createDemoTaskSources } from '../features/tasks';
import type { OperationProgressRegistry } from '../features/operations';
import { createDemoState, type DemoStateOptions } from './state';

export { DemoOperationError, type DemoFailureStage, type DemoState } from './state';

export interface DemoEnvironmentOptions extends DemoStateOptions {
  /** Seed synthetic showcase content (nested document tree) used by the demo server. */
  showcase?: boolean;
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
    onPathsChanged: (specId, paths) => sessions.refreshDocuments(specId, paths),
  });
  const specs = createDemoSpecs(state, documents);
  return { state, documents, sessions, specs };
}
export type DemoEnvironment = ReturnType<typeof createDemoEnvironment>;

/**
 * Wires the demo environment into the Runtime: read-side repositories and sources handed to the
 * feature modules, plus the demo-only routes. Optional overrides are injected seeded sources.
 */
export function createDemoRuntime(
  environment: DemoEnvironment,
  overrides: { references?: SessionReferenceOwner; documentSource?: DocumentContentSource } = {},
) {
  const { state, documents, sessions } = environment;
  const repositories = createDemoSpecsRepositories({ state, documents, sessions });
  const sessionReferences = sessions.overlayReferences(
    overrides.references ?? createDemoSessionReferences(repositories.catalogue),
  );
  const documentSource = documents.overlaySource(
    overrides.documentSource ?? createDemoDocumentSource(repositories.catalogue),
  );
  return {
    environment,
    ...repositories,
    sessionReferences,
    documentSource,
    taskSources: createDemoTaskSources(repositories.catalogue),
  };
}
export type DemoRuntime = ReturnType<typeof createDemoRuntime>;

/** Registers every demo-only route (`/api/demo/**`), each owned by its feature module. */
export function registerDemoRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  demo: DemoRuntime,
  progress?: OperationProgressRegistry,
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
  registerDemoDocumentRoutes(app, documents, demo.catalogue, demo.documentSource);
}
