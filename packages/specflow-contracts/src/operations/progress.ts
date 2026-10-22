import { Type, type TSchema } from 'typebox';

/**
 * Kind-agnostic progress model for long-running operations (Server-Sent Events).
 * The vocabulary of steps is defined per operation kind in `./kinds`; this file defines only the
 * generic envelope. Events never carry paths, journal internals or server error text.
 */

const OperationIdSchema = Type.String({
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
});

export const OPERATION_STEP_STATUSES = ['pending', 'running', 'done', 'skipped'] as const;
export type OperationStepStatus = (typeof OPERATION_STEP_STATUSES)[number];

/** Status a step can be moved to by a `step` event (`pending` only appears in snapshots). */
export const OPERATION_STEP_TRANSITIONS = ['running', 'done', 'skipped'] as const;

export const OPERATION_PROGRESS_STATUSES = [
  'running',
  'completed',
  'failed',
  'recovery-required',
] as const;
export type OperationProgressStatus = (typeof OPERATION_PROGRESS_STATUSES)[number];

const literals = (values: readonly string[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));

/**
 * Builds the event union for one kind. `stepIds` is that kind's vocabulary and `result` the typed
 * payload of its `completed` event.
 */
export function createOperationProgressEventSchema<
  TKind extends TSchema,
  TStepId extends TSchema,
  TResult extends TSchema,
>(kind: TKind, stepIds: TStepId, result: TResult) {
  const base = {
    operationId: OperationIdSchema,
    kind,
    at: Type.String(),
  };
  return Type.Union([
    Type.Object(
      {
        type: Type.Literal('snapshot'),
        ...base,
        status: literals(OPERATION_PROGRESS_STATUSES),
        steps: Type.Array(
          Type.Object(
            { id: stepIds, status: literals(OPERATION_STEP_STATUSES) },
            { additionalProperties: false },
          ),
        ),
        currentStep: Type.Optional(stepIds),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('step'),
        ...base,
        step: stepIds,
        status: literals(OPERATION_STEP_TRANSITIONS),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      { type: Type.Literal('completed'), ...base, result },
      { additionalProperties: false },
    ),
    Type.Object(
      { type: Type.Literal('failed'), ...base, code: Type.String({ minLength: 1 }) },
      { additionalProperties: false },
    ),
    Type.Object(
      { type: Type.Literal('recovery-required'), ...base },
      { additionalProperties: false },
    ),
  ]);
}

/** Kind-agnostic envelope check (kind and result left open); per-kind schemas are stricter. */
export const OperationProgressEventSchema = createOperationProgressEventSchema(
  Type.String(),
  Type.String(),
  Type.Unknown(),
);

export type OperationProgressEvent<TKind extends string = string, TResult = unknown> =
  | {
      readonly type: 'snapshot';
      readonly operationId: string;
      readonly kind: TKind;
      readonly at: string;
      readonly status: OperationProgressStatus;
      readonly steps: readonly { readonly id: string; readonly status: OperationStepStatus }[];
      readonly currentStep?: string;
    }
  | {
      readonly type: 'step';
      readonly operationId: string;
      readonly kind: TKind;
      readonly at: string;
      readonly step: string;
      readonly status: Exclude<OperationStepStatus, 'pending'>;
    }
  | {
      readonly type: 'completed';
      readonly operationId: string;
      readonly kind: TKind;
      readonly at: string;
      readonly result: TResult;
    }
  | {
      readonly type: 'failed';
      readonly operationId: string;
      readonly kind: TKind;
      readonly at: string;
      readonly code: string;
    }
  | {
      readonly type: 'recovery-required';
      readonly operationId: string;
      readonly kind: TKind;
      readonly at: string;
    };
export type OperationProgressEventType = OperationProgressEvent['type'];

export const OPERATION_PROGRESS_EVENT_TYPES = [
  'snapshot',
  'step',
  'completed',
  'failed',
  'recovery-required',
] as const satisfies readonly OperationProgressEventType[];

/**
 * Code of the synthetic `failed` event a stream sends for an operation id the Runtime does not know
 * (nothing was started, or it left the retention window). It says nothing about the operation.
 */
export const OPERATION_NOT_FOUND_CODE = 'OPERATION_NOT_FOUND';

export function isTerminalOperationProgressEvent(event: { readonly type: string }): boolean {
  return (
    event.type === 'completed' || event.type === 'failed' || event.type === 'recovery-required'
  );
}

export const OperationProgressParamsSchema = Type.Object(
  { operationId: OperationIdSchema },
  { additionalProperties: false },
);
