import type { SpecificationTaskResponse, TaskSnapshot } from '@nevo/specflow-contracts/tasks';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { specScope, type ProjectIdSource } from '../../specs';
import type { RequestAuthorization } from '../../auth';
import type { SessionReferenceOwner } from '../../sessions';
import type {
  DefinitionSource,
  ExecutionSource,
  HistorySource,
  TaskReadingSource,
} from '../reads/facts';
import { sameTask } from '../reads/facts';
import { taskVisibility } from '../reads/visibility';
import { PageLeases } from '../reads/page-leases';
import type { ReadOutcome } from '../reads/outcome';
import { projectionRevision } from '../reads/projection-revision';

export interface TaskReadDependencies {
  definitions?: DefinitionSource;
  execution?: ExecutionSource;
  history?: HistorySource;
  /** One read per request (definition, execution, history); wins over the separate ports. */
  reading?: TaskReadingSource;
  sessions?: SessionReferenceOwner;
  leases: PageLeases;
  /** The Runtime's project; every `spec.*` check runs at `specScope(projectId, specId)`. */
  projectId?: ProjectIdSource;
}
export async function readTaskDetail(
  deps: TaskReadDependencies,
  specId: string,
  taskId: string,
  authz: RequestAuthorization,
): Promise<ReadOutcome<SpecificationTaskResponse>> {
  authz.require({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: specScope(deps.projectId?.(), specId),
  });
  // One read for the whole detail when the source offers it; else the separate ports.
  const reading = deps.reading ? await deps.reading.read(specId, taskId) : undefined;
  if (!deps.reading && !deps.definitions) {
    return { kind: 'unavailable' };
  }

  const definition =
    reading === undefined ? await deps.definitions!.resolve(specId, taskId) : reading?.definition;
  if (!definition) {
    return { kind: 'not_found' };
  }

  const identity = definition.identity;
  if (identity.specId !== specId || identity.taskId !== taskId || definition.task.id !== taskId) {
    return { kind: 'unavailable' };
  }

  const visible = taskVisibility(identity, authz, deps.sessions);
  const execution =
    reading === undefined
      ? await deps.execution?.inspect(identity, definition.version)
      : (reading?.execution ?? undefined);
  const coherent =
    execution &&
    sameTask(execution.identity, identity) &&
    execution.definitionVersion === definition.version;
  // Every Session reference known up front resolves in one batch.
  await visible.prefetch(definition.dependencies.map((dependency) => dependency.link));
  const missing = { state: 'unavailable' as const, reason: 'not_implemented' as const };
  const snapshot: TaskSnapshot = {
    revision: JSON.stringify([definition.version, coherent ? execution.version : null]),
    specification: { id: specId, title: definition.specificationTitle },
    summary: definition.summary,
    group: definition.group,
    taskType: definition.taskType,
    sections: {
      work: coherent ? { state: 'available', data: structuredClone(execution.workflow) } : missing,
      document: definition.document,
      dependencies: { state: 'available', data: { items: [] } },
      history: missing,
    },
  };
  for (const dependency of definition.dependencies) {
    if ((await visible(dependency.link)) && snapshot.sections.dependencies.state === 'available') {
      snapshot.sections.dependencies.data.items.push(dependency);
    }
  }

  const context = authz.readContext();
  const history = !coherent
    ? undefined
    : reading === undefined
      ? await deps.history?.open(identity)
      : (reading?.history?.read ?? undefined);
  if (history && sameTask(history.identity, identity)) {
    snapshot.sections.history = {
      state: 'available',
      data: deps.leases.create({
        identity,
        context,
        kind: 'history',
        source: history,
        start: null,
        initialLimit: 5,
      }),
    };
  }

  snapshot.revision = projectionRevision(
    identity,
    context,
    [
      definition.version,
      coherent ? execution.version : null,
      history?.version ?? null,
      // Readiness follows the dependencies, which the definition version does not cover.
      JSON.stringify(definition.resource),
    ],
    snapshot,
  );

  return {
    kind: 'ok',
    value: {
      task: definition.task,
      purpose: definition.purpose,
      acceptanceCriteria: definition.acceptanceCriteria,
      workflow: definition.workflow,
      resource: definition.resource,
      snapshot,
    },
  };
}
