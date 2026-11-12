import type { SpecificationExitState } from '../close/blockers';
import { resolveSpecificationExecution } from '../definitions/catalogue';
import type { ExecutionSnapshot } from '../state/store';
import {
  executionTasks,
  pinnedDefinitionIfUnchanged,
  type WorkflowDependencies,
} from './loaded-execution';

/**
 * The workflow state of a Specification for Close and Abandon (`../close/blockers`): its execution
 * records joined as every operation joins them, and what holds it. Reads only, takes no lock: Close
 * calls it inside the project control lock, an action projection outside it. A Specification run
 * whose position does not follow from its history fails with `WORKFLOW_STATE_CORRUPT`.
 */
export async function readSpecificationExitState(
  dependencies: WorkflowDependencies,
  specId: string,
): Promise<SpecificationExitState> {
  return exitStateOf(dependencies, await dependencies.store.read(specId));
}

export async function exitStateOf(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
): Promise<SpecificationExitState> {
  const specId = snapshot.specId;
  const specification = snapshot.specification?.value;
  if (specification) {
    pinnedDefinitionIfUnchanged(dependencies.catalogue, specification.run);
  }

  const { tasks, broken } = executionTasks(dependencies.catalogue, snapshot);
  const registered = [
    ...new Set([
      ...(snapshot.index?.value.tasks.map((entry) => entry.id) ?? []),
      ...snapshot.manifests.map((entry) => entry.value.id),
    ]),
  ].sort();
  const pendingTaskDocuments: string[] = [];
  for (const taskId of registered) {
    if (await dependencies.references.pendingDocumentChange(specId, taskId)) {
      pendingTaskDocuments.push(taskId);
    }
  }

  return {
    specId,
    ...(specification ? { specification } : {}),
    bound:
      specification !== undefined ||
      resolveSpecificationExecution(
        dependencies.catalogue,
        await dependencies.references.archetype(specId),
      ).kind !== 'problem',
    tasks,
    brokenTasks: broken,
    pendingExecutionChange: await dependencies.holds.pendingExecutionChange(specId),
    pendingTaskDocuments,
    operationInProgress: await dependencies.holds.operationInProgress(specId),
  };
}
