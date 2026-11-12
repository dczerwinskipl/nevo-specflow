import type { TFunction } from 'i18next';

type Executors = readonly ('agent' | 'human')[];

/** Who may work on a step, for its facts line: "Agent", "Human" or "Agent / Human". */
export function executorsLabel(t: TFunction, executors: Executors): string {
  return executors.map((executor) => t(`taskDetails.executor.${executor}`)).join(' / ');
}

/** A step a person may work on. */
export function isHumanStep(step: { readonly executors: Executors } | undefined): boolean {
  return step?.executors.includes('human') ?? false;
}
