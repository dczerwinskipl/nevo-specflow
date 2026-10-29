import type { SpecificationCreateStep } from '@nevo/specflow-contracts/operations';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { message, type Message } from '../../../../i18n/message';
import type {
  OperationProgressNeutral,
  OperationProgressStep,
} from '../../../../shared/operations/progress/OperationProgress';
import type { OperationStepView } from '../../../../shared/operations/progress/progressState';

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
 * without its entry, and adding one is exactly one entry here plus its three
 * catalogue keys. A pending step needs no copy of its own: it shows only its title, muted.
 */
const stepCopy = {
  reserving: stepEntry('reserving'),
  'preparing-workspace': stepEntry('preparing-workspace'),
  'writing-specification': stepEntry('writing-specification'),
  'committing-specification': stepEntry('committing-specification'),
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

/** The honest single row while no step is known; `lost` is the stream being unavailable. */
export const createNeutralProgress = (lost: boolean): OperationProgressNeutral => ({
  label: message('create.progress.neutral.title'),
  description: message(
    lost ? 'create.progress.neutral.descriptionLost' : 'create.progress.neutral.description',
  ),
});

/**
 * Steps the Runtime reported, in user language: a title and, once the step has started, one line
 * (running: what is happening, done: what happened); a pending step is only its muted title, with
 * no repeated "waiting" line. Skipped steps are omitted
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
        ...(step.status === 'done'
          ? { description: copy.done }
          : step.status === 'running'
            ? { description: copy.running }
            : {}),
        status: step.status,
      };
    });
}

const stepOrder: readonly SpecificationCreateStep[] = [
  'reserving',
  'preparing-workspace',
  'writing-specification',
  'committing-specification',
  'registering',
];

/**
 * The checklist of a finished Create, for when the live stream is gone (it is closed once the
 * operation concluded): every step done, the workspace step only when one is prepared and the
 * commit step only when the Engine commits the scaffold (Git enabled, `commits` in the options).
 */
export function createCompletedSteps(
  target: CreateSpecRequest['target'],
  commits = false,
): readonly OperationProgressStep[] {
  return createProgressSteps(
    stepOrder
      .filter((id) => id !== 'preparing-workspace' || target?.kind === 'new-worktree')
      .filter((id) => id !== 'committing-specification' || commits)
      .map((id) => ({ id, status: 'done' as const })),
  );
}

/** The title of one public step id (the generic title for an id this build does not know). */
export function createStepTitle(stepId: string): Message {
  return ((stepCopy as Readonly<Record<string, StepCopy | undefined>>)[stepId] ?? unknownStepCopy)
    .title;
}

/** The title of the step that is running now, or undefined while none is (the page then says it generically). */
export function createRunningStepTitle(steps: readonly OperationStepView[]): Message | undefined {
  const running = steps.find((step) => step.status === 'running');

  return running ? createStepTitle(running.id) : undefined;
}
