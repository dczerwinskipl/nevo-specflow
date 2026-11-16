import type { FastifyInstance, RawServerBase } from 'fastify';
import {
  createDemoDocumentReadSource,
  createDemoDocuments,
  createDemoTaskDocuments,
  registerDemoDocumentRoutes,
} from '../features/documents';
import {
  createDemoSessionReferences,
  createDemoManagedSessionReads,
  createDemoSessions,
  registerDemoSessionRoutes,
} from '../features/sessions';
import { createDemoAssociationTargets } from '../features/session-associations';
import {
  createDemoSpecs,
  createDemoSpecsRepositories,
  createDemoWorkspaceList,
  registerDemoSpecRoutes,
} from '../features/specs';
import {
  createDemoTaskEngine,
  createEngineTaskProgress,
  createEngineTaskSources,
  createEngineWorkspaceTasks,
  seedDemoWorkflow,
} from '../features/tasks';
import { createDemoWorkflow } from '../features/workflow';
import type { DemoProgress } from '../features/specs/demo/endpoints';
import { demoSpecificationArchetypes } from './catalogue';
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
 * feature modules, plus the demo-only routes. The Specifications' workflow is the Engine's, run in
 * memory (`adr.0025-demo-runs-the-engine-in-memory`): the Task reads, lists, commands and workflow
 * actions are a project Runtime's over that state. The seeded catalogue (with the Sessions
 * allocated in this environment) is the Session association registry.
 */
export function createDemoRuntime(environment: DemoEnvironment) {
  const { state, documents, sessions, specs } = environment;
  // The Tasks owner's contributions are bound below: the workflow reads the catalogue.
  const repositories = createDemoSpecsRepositories({
    state,
    documents,
    sessions,
    tasks: {
      section: (specId) => workspaceTasks(specId),
      progress: (specIds) => taskProgress(specIds),
    },
  });
  const find = (specId: string) => repositories.catalogue.find(specId);
  const workflow = createDemoWorkflow({
    specificationArchetypes: demoSpecificationArchetypes,
    lookups: {
      archetype: async (specId) => (await documents.directory(specId, find))?.archetype.id,
      documentIds: async (specId) =>
        (await documents.directory(specId, find))?.registry.map((entry) => entry.id) ?? [],
      documentsOfType: (scope, type) =>
        scope.kind === 'task'
          ? taskDocuments.documentsOfType(scope.specId, scope.taskId, type)
          : documents.documentsOfType(scope.specId, type, find),
    },
    seed: seedDemoWorkflow,
  });
  const taskDocuments = createDemoTaskDocuments({
    async manifest(specId, taskId) {
      const snapshot = await workflow.store.read(specId);
      const manifest = snapshot.manifests.find((entry) => entry.value.id === taskId);

      return manifest && { revision: manifest.revision, documents: manifest.value.documents };
    },
    initialText: (specId, taskId, path) =>
      Promise.resolve(workflow.store.document(specId, taskId, path)),
  });
  const taskEngine = createDemoTaskEngine({
    openWorkflow: workflow.open,
    async specification(specId) {
      const [record, read] = await Promise.all([
        find(specId),
        repositories.workspaceRepository.readSpecification(specId),
      ]);

      return record && read
        ? {
            projectId: state.catalogue.project.id,
            workspaceId: read.workspaceId,
            title: record.title,
          }
        : null;
    },
    mainDocument: (specId, taskId) => taskDocuments.mainDocument(specId, taskId),
  });
  const workspaceTasks = createEngineWorkspaceTasks(taskEngine);
  const taskProgress = createEngineTaskProgress(taskEngine);
  const taskReads = createEngineTaskSources(taskEngine);
  const sessionReferences = sessions.overlayReferences(
    createDemoSessionReferences(repositories.catalogue),
  );
  const sessionList = sessions.list(repositories.catalogue);

  return {
    environment,
    ...repositories,
    sessionReferences,
    sessionList,
    managedSessionReads: createDemoManagedSessionReads({
      state,
      list: sessionList,
      references: sessionReferences,
      catalogue: repositories.catalogue,
    }),
    associationTargets: createDemoAssociationTargets({
      catalogue: repositories.catalogue,
      isArchived: async (specId) =>
        (await repositories.overviewRepository.readArchive()).items.some(
          (item) => item.id === specId,
        ),
      definitions: taskReads.definitions,
    }),
    documentReadSource: createDemoDocumentReadSource(documents, repositories.catalogue),
    /** The Task documents of the demo Tasks, served at the real Task document routes. */
    taskDocuments: taskDocuments.source,
    /** The Engine behind the Task reads, lists and commands and the workflow routes. */
    taskEngine,
    // `GET /api/workspaces` over the demo registry, with the Specifications bound to each.
    workspaceList: createDemoWorkspaceList({
      registry: () => specs.registry(),
      catalogue: repositories.catalogue,
      state,
    }),
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
