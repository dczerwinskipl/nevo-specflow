import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

import { WorkflowError } from './errors';
import { ARTIFACTS_MAX, TASKS_PER_FINISH_MAX, TASKS_PER_SPECIFICATION_MAX } from './limits';

/**
 * The shape of the caller input of the operations, checked before anything is planned, so a value of
 * the wrong type is refused as `WORKFLOW_INPUT_INVALID` instead of failing as a `TypeError` deep in
 * the planning. The field rules (text limits, ids, allowed transitions) stay with the code that
 * applies them (`../limits`).
 */

const TaskDecisionSchema = Type.Object({
  taskId: Type.String(),
  status: Type.String(),
  reason: Type.Optional(Type.String()),
});

const FinishInputSchema = Type.Object({
  result: Type.Optional(Type.String()),
  feedback: Type.Optional(Type.String()),
  artifacts: Type.Optional(Type.Array(Type.String(), { maxItems: ARTIFACTS_MAX })),
  tasks: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        title: Type.String(),
        summary: Type.Optional(Type.String()),
        type: Type.String(),
        dependsOn: Type.Optional(Type.Array(Type.String())),
      }),
      { maxItems: TASKS_PER_FINISH_MAX },
    ),
  ),
  taskDecisions: Type.Optional(
    Type.Array(TaskDecisionSchema, { maxItems: TASKS_PER_SPECIFICATION_MAX }),
  ),
});

function assertShape(schema: TSchema, value: unknown, what: string): void {
  if (!Value.Check(schema, value)) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The ${what} does not have the expected shape.`,
    );
  }
}

/** The finish input of `finishStep`. */
export function assertFinishInputShape(input: unknown): void {
  assertShape(FinishInputSchema, input, 'finish input');
}

/** The decision of `setTaskStatus`. */
export function assertTaskDecisionShape(decision: unknown): void {
  assertShape(TaskDecisionSchema, decision, 'Task decision');
}
