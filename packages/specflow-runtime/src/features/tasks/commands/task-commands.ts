import {
  createTask,
  editTask,
  removeTask,
  setTaskStatus,
  type OwnerActor,
} from '@nevo/specflow-engine';
import type {
  CreateTaskInput,
  EditTaskInput,
  SetTaskStatusInput,
  TaskChangeResult,
  TaskRemoveResult,
  TaskStatusResult,
} from '@nevo/specflow-contracts/tasks';

import type { RequestAuthorization } from '../../auth';
import type { TaskEngine } from '../engine/sources';

/**
 * The owner's Task commands as the HTTP routes need them. Every rule (ids, type policy, context
 * references, dependencies, revisions, removal) is the Engine's; the actor is always given by the
 * caller from trusted context, never read from a request body.
 */
export interface TaskCommands {
  create(specId: string, input: CreateTaskInput, actor: OwnerActor): Promise<TaskChangeResult>;
  edit(
    specId: string,
    taskId: string,
    input: EditTaskInput,
    actor: OwnerActor,
  ): Promise<TaskChangeResult>;
  remove(
    specId: string,
    taskId: string,
    expectedRevision: string,
    actor: OwnerActor,
  ): Promise<TaskRemoveResult>;
  setStatus(
    specId: string,
    taskId: string,
    input: SetTaskStatusInput,
    actor: OwnerActor,
  ): Promise<TaskStatusResult>;
}

/**
 * The person behind an HTTP request: the authenticated subject (or the trusted local identity), the
 * same identity the Session routes record. The Runtime authenticated it, so `trust` is
 * `authenticated`.
 */
export function ownerActorOf(authz: RequestAuthorization): OwnerActor {
  return {
    class: 'human',
    details: { actorId: authz.readContext().subject, trust: 'authenticated' },
  };
}

/** The production commands: the Engine's Task use cases over freshly opened workflow operations. */
export function createEngineTaskCommands(source: TaskEngine): TaskCommands {
  return {
    async create(specId, input, actor) {
      const result = await createTask(await source.openWorkflow(), {
        specId,
        taskId: input.taskId,
        title: input.title,
        type: input.type,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        actor,
      });

      return { taskId: result.task.taskId, revision: result.revision };
    },
    async edit(specId, taskId, input, actor) {
      const result = await editTask(await source.openWorkflow(), {
        specId,
        taskId,
        expectedRevision: input.expectedRevision,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
        ...(input.context !== undefined ? { context: input.context } : {}),
        actor,
      });

      return { taskId: result.task.taskId, revision: result.revision };
    },
    async remove(specId, taskId, expectedRevision, actor) {
      await removeTask(await source.openWorkflow(), { specId, taskId, expectedRevision, actor });

      return { taskId };
    },
    async setStatus(specId, taskId, input, actor) {
      const result = await setTaskStatus(await source.openWorkflow(), {
        specId,
        taskId,
        status: input.status,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        actor,
      });

      return { taskId, status: result.status };
    },
  };
}
