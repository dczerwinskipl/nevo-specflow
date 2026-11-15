import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

import { WorkflowError } from './errors';
import {
  ARTIFACTS_MAX,
  ARTIFACT_MAX,
  FEEDBACK_MAX,
  TASKS_PER_FINISH_MAX,
  TASKS_PER_SPECIFICATION_MAX,
} from './limits';
import { ActorSchema } from './state/codec';

/**
 * The shape of the caller input of the operations, checked before anything is planned, so a value of
 * the wrong type is refused as `WORKFLOW_INPUT_INVALID` instead of failing as a `TypeError` deep in
 * the planning, and the size limits the stored records impose (`./limits`), checked before anything
 * changes. The workflow rules (allowed results, required feedback) are the coordinator's.
 */

/** What a finish hands over to the next step. */
export interface FinishInput {
  readonly result?: string;
  readonly feedback?: string;
  readonly artifacts?: readonly string[];
}

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

function invalidInput(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

function assertShape(schema: TSchema, value: unknown, what: string): void {
  if (!Value.Check(schema, value)) {
    invalidInput(`The ${what} does not have the expected shape.`);
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

/**
 * The actor of a command comes from trusted Runtime/CLI context; one the stored records cannot hold
 * is refused before anything is planned.
 */
export function assertActorShape(actor: unknown): void {
  if (!Value.Check(ActorSchema, actor)) {
    throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', 'The actor is not a valid actor.');
  }
}

/** Feedback is stored trimmed; it must fit the stored limit. */
export function assertFeedback(feedback: string | undefined): void {
  if (feedback !== undefined && feedback.trim().length > FEEDBACK_MAX) {
    invalidInput(`The feedback is longer than ${FEEDBACK_MAX} characters.`);
  }
}

/** The finish input must fit the stored attempt record, so it is checked before anything changes. */
export function assertFinishInput(input: FinishInput): void {
  assertFeedback(input.feedback);
  const artifacts = input.artifacts ?? [];
  if (artifacts.length > ARTIFACTS_MAX) {
    invalidInput(`At most ${ARTIFACTS_MAX} artifacts can be named.`);
  }

  for (const artifact of artifacts) {
    if (!artifact.trim() || artifact.length > ARTIFACT_MAX) {
      invalidInput(`An artifact must be a non-empty text of at most ${ARTIFACT_MAX} characters.`);
    }
  }
}
