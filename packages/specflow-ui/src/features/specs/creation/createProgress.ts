import type { SpecificationCreateStep } from '@nevo/specflow-contracts/operations';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../i18n/message';
import type { OperationProgressStep } from '../../../shared/operations/OperationProgress';
import type { OperationStepView } from '../../../shared/operations/progressState';

/** Accessible name of the Create checklist. */
export const createProgressLabel: Message = message('create.progress.label');

/**
 * Copy of the public step vocabulary of `specification-create` (the Runtime maps its journal onto
 * these ids and never exposes raw stages). Exhaustive by type: a new public step cannot ship
 * without its label.
 */
const stepLabels = {
  reserving: message('create.progress.steps.reserving'),
  'preparing-workspace': message('create.progress.steps.preparing-workspace'),
  'writing-specification': message('create.progress.steps.writing-specification'),
  registering: message('create.progress.steps.registering'),
} satisfies Record<SpecificationCreateStep, Message>;

/** Steps the Runtime reported, labelled. A step this build does not know is not drawn. */
export function createProgressSteps(
  steps: readonly OperationStepView[],
): readonly OperationProgressStep[] {
  return steps.flatMap((step) => {
    const label = (stepLabels as Readonly<Record<string, Message | undefined>>)[step.id];
    return label ? [{ id: step.id, label, status: step.status }] : [];
  });
}

/**
 * Rows reserved before the first snapshot arrives, so the checklist does not move the page when
 * it appears: an existing workspace has no "preparing the workspace" step.
 */
export function createProgressPlaceholderRows(target: CreateSpecRequest['target']): number {
  return target?.kind === 'new-worktree' ? 4 : 3;
}

const stepOrder: readonly SpecificationCreateStep[] = [
  'reserving',
  'preparing-workspace',
  'writing-specification',
  'registering',
];

/**
 * The checklist of a finished Create, for when the live stream is gone (it is closed once the
 * operation concluded): every step done, the workspace step only when one is prepared.
 */
export function createCompletedSteps(
  target: CreateSpecRequest['target'],
): readonly OperationProgressStep[] {
  return createProgressSteps(
    stepOrder
      .filter((id) => id !== 'preparing-workspace' || target?.kind === 'new-worktree')
      .map((id) => ({ id, status: 'done' as const })),
  );
}
