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
 * - `next`: the step a finish of `current` leads to: the step declared after it when one of its
 *   transitions targets that step, else the only step its transitions target; absent when its
 *   transitions lead to several other steps or none. Before the first start, the entry step.
 * - `tasksStep`: the first step that declares `produces: tasks`, when the run can still reach it
 *   through transitions (from `current`, itself included, or from the entry step before the first
 *   start); absent otherwise and once the run ended.
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

/** The distinct steps the transitions of `step` lead to, in declared order. */
function stepTargets(step: WorkflowStep): string[] {
  const targets = step.transitions.flatMap((transition) =>
    transition.target.kind === 'step' ? [transition.target.step] : [],
  );

  return [...new Set(targets)];
}

/** Whether `goal` can be reached from `from` through transitions (`from` itself counts). */
function reaches(definition: WorkflowDefinition, from: string, goal: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === goal) {
      return true;
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    const step = definition.steps.find((candidate) => candidate.id === id);
    queue.push(...(step ? stepTargets(step) : []));
  }

  return false;
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

  const indexOf = (id: string) => steps.findIndex((step) => step.id === id);

  let current: OutlineStep | undefined;
  let next: OutlineStep | undefined;
  let from: string | undefined;
  if (position.kind === 'not-started') {
    next = at(indexOf(definition.entryStep));
    from = definition.entryStep;
  } else if (position.kind === 'at') {
    const index = indexOf(position.step);
    const step = steps[index];
    if (step) {
      current = at(index);
      from = step.id;
      const targets = stepTargets(step);
      const successor = steps[index + 1];
      const target =
        successor && targets.includes(successor.id)
          ? successor.id
          : targets.length === 1
            ? targets[0]
            : undefined;
      next = target === undefined ? undefined : at(indexOf(target));
    }
  }

  const producing = steps.find(producesTasks);
  const tasksStep =
    producing && from !== undefined && reaches(definition, from, producing.id)
      ? at(indexOf(producing.id))
      : undefined;

  return {
    stepCount: steps.length,
    ...(current ? { current } : {}),
    ...(next ? { next } : {}),
    ...(tasksStep ? { tasksStep } : {}),
  };
}
