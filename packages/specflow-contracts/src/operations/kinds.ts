import { Type } from 'typebox';

import { CreatedSpecSchema } from '../specs/create';
import { createOperationProgressEventSchema } from './progress';

/** Stable, public step vocabulary of the Specification create operation (not raw journal stages). */
export const SPECIFICATION_CREATE_STEPS = [
  'reserving',
  'preparing-workspace',
  'writing-specification',
  'registering',
] as const;
export type SpecificationCreateStep = (typeof SPECIFICATION_CREATE_STEPS)[number];

/** An `existing` target has no workspace to prepare, so the step is not part of its checklist. */
export function specificationCreateSteps(
  target: 'existing' | 'new-worktree',
): readonly SpecificationCreateStep[] {
  return target === 'existing'
    ? SPECIFICATION_CREATE_STEPS.filter((step) => step !== 'preparing-workspace')
    : SPECIFICATION_CREATE_STEPS;
}

const specificationCreateEventSchema = createOperationProgressEventSchema(
  Type.Literal('specification-create'),
  Type.Union(SPECIFICATION_CREATE_STEPS.map((step) => Type.Literal(step))),
  CreatedSpecSchema,
);

/**
 * Registry of operation kinds that publish progress. To add a kind: define its step vocabulary and
 * typed result here, then publish into the Runtime registry (see docs/engineering).
 */
export const OPERATION_KINDS = {
  'specification-create': {
    steps: SPECIFICATION_CREATE_STEPS,
    eventSchema: specificationCreateEventSchema,
  },
} as const;
export type OperationKind = keyof typeof OPERATION_KINDS;

export const OPERATION_KIND_IDS = Object.keys(OPERATION_KINDS) as readonly OperationKind[];

export function isOperationKind(value: string): value is OperationKind {
  return Object.hasOwn(OPERATION_KINDS, value);
}

export const OperationKindQuerySchema = Type.Object(
  { kind: Type.Union(OPERATION_KIND_IDS.map((kind) => Type.Literal(kind))) },
  { additionalProperties: false },
);

/** Strict per-kind event schema, e.g. for contract tests of fixtures. */
export function operationProgressEventSchema<TKind extends OperationKind>(kind: TKind) {
  return OPERATION_KINDS[kind].eventSchema;
}
