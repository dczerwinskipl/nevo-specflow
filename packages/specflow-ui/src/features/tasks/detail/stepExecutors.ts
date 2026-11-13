import type { TFunction } from 'i18next';

type Executor = 'agent' | 'human';
type Executors = readonly Executor[];

/**
 * A step's facts line: its id, then who may work on it ("Agent", "Human" or "Agent / Human"). A
 * wait step (no executors) shows only its id.
 */
export function stepLine(
  t: TFunction,
  step: { readonly id: string; readonly executors: Executors },
) {
  return [
    step.id,
    step.executors.map((executor) => t(`taskDetails.executor.${executor}`)).join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A step only a person may work on. */
export function isHumanStep(step: { readonly executors: Executors } | undefined): boolean {
  return step?.executors.length === 1 && step.executors[0] === 'human';
}

/**
 * Whether a person works on the active attempt: its recorded actor when the source names one, else
 * whether only a person may work on the step.
 */
export function isHumanAttempt(position: {
  readonly step: { readonly executors: Executors };
  readonly actor?: { readonly class: Executor };
}): boolean {
  return position.actor ? position.actor.class === 'human' : isHumanStep(position.step);
}
