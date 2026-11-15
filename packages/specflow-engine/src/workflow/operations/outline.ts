import type { WorkflowDefinition, WorkflowStep } from '../definitions/model';

/** A step of the outline: its id, its title and its 1-based position in declared order. */
export interface OutlineStep {
  readonly step: string;
  readonly title: string;
  readonly position: number;
}

/**
 * Where a run stands among its workflow's steps, in declared order (display facts; a workflow may
 * loop or branch, so this is no execution order):
 * - `stepCount`: how many steps the workflow declares;
 * - `current`: the step the run is at (active, waiting or ready); absent before the first start and
 *   once the run ended;
 * - `next`: the step declared after `current`, or the entry step before the first start; absent
 *   after the last step and once the run ended;
 * - `tasksStep`: the first step that declares `produces: tasks`; absent when no step does.
 */
export interface WorkflowOutline {
  readonly stepCount: number;
  readonly current?: OutlineStep;
  readonly next?: OutlineStep;
  readonly tasksStep?: OutlineStep;
}

/** Where the run is: before its first start, at a step, or ended. */
export type OutlinePosition =
  | { readonly kind: 'not-started' }
  | { readonly kind: 'at'; readonly step: string }
  | { readonly kind: 'ended' };

function producesTasks(step: WorkflowStep): boolean {
  return step.kind === 'work' && step.annotations.produces === 'tasks';
}

/** The outline of `definition` for a run at `position`. Generic: no step id is special. */
export function outlineOf(
  definition: WorkflowDefinition,
  position: OutlinePosition,
): WorkflowOutline {
  const steps = definition.steps;
  const at = (index: number): OutlineStep | undefined => {
    const step = steps[index];

    return step ? { step: step.id, title: step.title, position: index + 1 } : undefined;
  };

  const producing = steps.findIndex(producesTasks);
  const tasksStep = producing >= 0 ? at(producing) : undefined;
  let current: OutlineStep | undefined;
  let next: OutlineStep | undefined;
  if (position.kind === 'not-started') {
    next = at(steps.findIndex((step) => step.id === definition.entryStep));
  } else if (position.kind === 'at') {
    const index = steps.findIndex((step) => step.id === position.step);
    current = index >= 0 ? at(index) : undefined;
    next = index >= 0 ? at(index + 1) : undefined;
  }

  return {
    stepCount: steps.length,
    ...(current ? { current } : {}),
    ...(next ? { next } : {}),
    ...(tasksStep ? { tasksStep } : {}),
  };
}
