import { Type, type Static } from 'typebox';
import { SpecIdSchema, TaskIdSchema } from '../identifiers';
import { TaskSnapshotSchema } from './task-read';
import { TaskResourceFactsSchema } from './task-resource';
import { TaskStatusLineSchema } from './task-list';
export * from './task-list';
export * from './task-read';
export * from './task-resource';
export const TaskReadErrorSchema = Type.Object(
  {
    error: Type.Union([
      Type.Literal('specification_task_not_found'),
      Type.Literal('specification_source_unavailable'),
    ]),
  },
  { $id: 'TaskReadError' },
);
const IdSchema = Type.String({
  minLength: 1,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
});
export const SpecificationTaskParamsSchema = Type.Object(
  { specId: SpecIdSchema, taskId: TaskIdSchema },
  { additionalProperties: false },
);

export const WorkspaceTaskSchema = Type.Object({
  id: IdSchema,
  title: Type.String(),
  status: TaskStatusLineSchema,
  /** The Task Type with its catalogue title; project mode (the Engine's Task resource). */
  type: Type.Optional(Type.Object({ id: Type.String(), title: Type.String() })),
  /** The Tasks it depends on; project mode. */
  dependsOn: Type.Optional(Type.Array(TaskIdSchema)),
  /** The attention projection has an item for the Task (or the Specification's names it). */
  attention: Type.Optional(Type.Boolean()),
});
export const SpecificationTaskResponseSchema = Type.Object({
  task: WorkspaceTaskSchema,
  purpose: Type.Optional(Type.String()),
  acceptanceCriteria: Type.Array(Type.String()),
  workflow: Type.Optional(Type.String()),
  /** The Task resource (status, dependencies, context, revision); project mode, from the Engine. */
  resource: Type.Optional(TaskResourceFactsSchema),
  snapshot: Type.Optional(TaskSnapshotSchema),
});
export type SpecificationTaskResponse = Static<typeof SpecificationTaskResponseSchema>;
export type WorkspaceTask = Static<typeof WorkspaceTaskSchema>;
