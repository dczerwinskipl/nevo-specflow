import type { SpecificationCreateStep } from '@nevo/specflow-contracts/operations';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../i18n/message';
import type {
  OperationProgressNeutral,
  OperationProgressStep,
} from '../../../shared/operations/OperationProgress';
import type { OperationStepView } from '../../../shared/operations/progressState';

/** Accessible name of the Create checklist. */
export const createProgressLabel: Message = message('create.progress.label');

/** What one step is called and what it says while it runs and once it is done (user language). */
interface StepCopy {
  readonly title: Message;
  readonly running: Message;
  readonly done: Message;
}

/**
 * Copy of the public step vocabulary of `specification-create` (the Runtime maps its journal onto
 * these ids and never exposes raw stages). Exhaustive by type: a new public step cannot ship
 * without its entry, and adding one (for example `committing-specification`) is exactly one entry
 * here plus its three catalogue keys. A pending step needs no entry of its own: it always reads
 * "Waiting for previous step".
 */
const stepCopy = {
  reserving: stepEntry('reserving'),
  'preparing-workspace': stepEntry('preparing-workspace'),
  'writing-specification': stepEntry('writing-specification'),
  registering: stepEntry('registering'),
} satisfies Record<SpecificationCreateStep, StepCopy>;

/** A step id this build does not know (a newer Runtime): drawn generically, never dropped. */
const unknownStepCopy: StepCopy = stepEntry('unknown');

function stepEntry(id: SpecificationCreateStep | 'unknown'): StepCopy {
  return {
    title: message(`create.progress.steps.${id}.title`),
    running: message(`create.progress.steps.${id}.running`),
    done: message(`create.progress.steps.${id}.done`),
  };
}

const waiting: Message = message('create.progress.waiting');

/** The honest single row while no step is known; `lost` is the stream being unavailable. */
export const createNeutralProgress = (lost: boolean): OperationProgressNeutral => ({
  label: message('create.progress.neutral.title'),
  description: message(
    lost ? 'create.progress.neutral.descriptionLost' : 'create.progress.neutral.description',
  ),
});

/**
 * Steps the Runtime reported, in user language: a title and one line that depends on the state
 * (running: what is happening, done: what happened, pending: waiting). Skipped steps are omitted
 * (an existing workspace has no "preparing the workspace"); an unknown id gets the generic copy.
 */
export function createProgressSteps(
  steps: readonly OperationStepView[],
): readonly OperationProgressStep[] {
  return steps
    .filter((step) => step.status !== 'skipped')
    .map((step) => {
      const copy =
        (stepCopy as Readonly<Record<string, StepCopy | undefined>>)[step.id] ?? unknownStepCopy;
      return {
        id: step.id,
        label: copy.title,
        description:
          step.status === 'done' ? copy.done : step.status === 'running' ? copy.running : waiting,
        status: step.status,
      };
    });
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
