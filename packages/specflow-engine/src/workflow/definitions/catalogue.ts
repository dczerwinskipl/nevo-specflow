import {
  ANY_TASK_TYPE,
  type ArchetypeDefinition,
  type SpecificationExecution,
} from '@nevo/specflow-contracts/documents';

import type { LoadResult } from '../../specs/definitions/loader';
import { SPECIFICATION_ARCHETYPE_KIND } from '../../specs/definitions/kinds/specification-archetype';
import {
  AGENT_ARCHETYPE_KIND,
  TASK_TYPE_KIND,
  WORKFLOW_KIND,
  type AgentArchetype,
  type TaskType,
  type TaskTypes,
  type WorkflowDefinition,
} from './model';

/**
 * The execution definitions of one Project Home, looked up by id. Only definitions that loaded
 * without problems are present. A task type's workflow is resolved at load time; the agent archetypes
 * of workflow steps and the execution bindings of Specification archetypes are not, so a lookup can
 * miss (`archetype-missing`, {@link resolveSpecificationExecution}).
 */
export interface ExecutionCatalogue {
  workflow(id: string): WorkflowDefinition | undefined;
  archetype(id: string): AgentArchetype | undefined;
  taskType(id: string): TaskType | undefined;
  taskTypes(): readonly TaskType[];
  /** The execution binding of a Specification archetype. */
  specificationExecution(archetypeId: string): SpecificationExecution | undefined;
}

export type SpecificationExecutionResolution =
  | {
      readonly kind: 'resolved';
      readonly workflow: WorkflowDefinition;
      readonly taskTypes: TaskTypes;
    }
  | { readonly kind: 'problem'; readonly message: string };

/**
 * The execution binding of a Specification archetype, resolved against the loaded definitions. A
 * broken binding never invalidates the archetype itself (its document templates keep working); it
 * is reported here, where Specification execution starts (`WORKFLOW_NOT_CONFIGURED`), and surfaces
 * can call it to show the problem beforehand.
 */
export function resolveSpecificationExecution(
  catalogue: ExecutionCatalogue,
  archetypeId: string,
): SpecificationExecutionResolution {
  const binding = catalogue.specificationExecution(archetypeId);
  if (!binding) {
    return {
      kind: 'problem',
      message: `The Specification archetype "${archetypeId}" has no execution binding.`,
    };
  }

  const workflow = catalogue.workflow(binding.workflow);
  if (workflow?.subject !== 'specification') {
    return {
      kind: 'problem',
      message: `The workflow "${binding.workflow}" of the Specification archetype "${archetypeId}" is not a valid Specification workflow.`,
    };
  }

  const taskTypes = binding.taskTypes ?? [ANY_TASK_TYPE];
  const missing =
    taskTypes[0] === ANY_TASK_TYPE ? [] : taskTypes.filter((id) => !catalogue.taskType(id));
  if (missing.length > 0) {
    return {
      kind: 'problem',
      message: `The task types ${missing.map((id) => `"${id}"`).join(', ')} of the Specification archetype "${archetypeId}" are not defined.`,
    };
  }

  return { kind: 'resolved', workflow, taskTypes };
}

export interface ExecutionEntities {
  readonly workflows: readonly WorkflowDefinition[];
  readonly archetypes: readonly AgentArchetype[];
  readonly taskTypes: readonly TaskType[];
  readonly specificationArchetypes: readonly Pick<ArchetypeDefinition, 'id' | 'execution'>[];
}

export function createExecutionCatalogue(entities: ExecutionEntities): ExecutionCatalogue {
  const byId = <T extends { readonly id: string }>(items: readonly T[]) =>
    new Map(items.map((item) => [item.id, item] as const));
  const workflows = byId(entities.workflows);
  const archetypes = byId(entities.archetypes);
  const taskTypes = byId(entities.taskTypes);
  const specifications = byId(entities.specificationArchetypes);

  return {
    workflow: (id) => workflows.get(id),
    archetype: (id) => archetypes.get(id),
    taskType: (id) => taskTypes.get(id),
    taskTypes: () => [...taskTypes.values()],
    specificationExecution: (id) => specifications.get(id)?.execution,
  };
}

function entitiesOf<T>(result: LoadResult, kind: string): T[] {
  return [...(result.definitions.get(kind)?.values() ?? [])].map((loaded) => loaded.entity as T);
}

/** The catalogue of a loaded definitions tree (no I/O). */
export function resolveExecutionCatalogue(result: LoadResult): ExecutionCatalogue {
  return createExecutionCatalogue({
    workflows: entitiesOf<WorkflowDefinition>(result, WORKFLOW_KIND),
    archetypes: entitiesOf<AgentArchetype>(result, AGENT_ARCHETYPE_KIND),
    taskTypes: entitiesOf<TaskType>(result, TASK_TYPE_KIND),
    specificationArchetypes: entitiesOf<ArchetypeDefinition>(result, SPECIFICATION_ARCHETYPE_KIND),
  });
}
