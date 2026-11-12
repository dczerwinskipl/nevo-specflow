/**
 * The compiled workflow definition the coordinator interprets. Neutral: a step is `work` (done by
 * one of its allowed executor classes) or `wait` (completed by a host event whose name the core
 * never interprets). Everything else a host needs (effects, Sessions, escalation, what a step
 * produces) travels as opaque `annotations` the core carries but never reads; they are part of the
 * definition, so they are covered by its revision.
 */

export const EXECUTOR_CLASSES = ['agent', 'human'] as const;
/** Who may work on a step: an agent, or a person. */
export type ExecutorClass = (typeof EXECUTOR_CLASSES)[number];

export type TerminalOutcome = 'completed' | 'abandoned';

/** The shapes of a host's annotations, one per place they can appear. */
export interface HostAnnotations {
  readonly definition: unknown;
  readonly work: unknown;
  readonly wait: unknown;
  readonly transition: unknown;
  readonly return: unknown;
}

type Empty = Readonly<Record<string, never>>;

/** A host without annotations writes `annotations: {}` everywhere. */
export interface NoAnnotations extends HostAnnotations {
  readonly definition: Empty;
  readonly work: Empty;
  readonly wait: Empty;
  readonly transition: Empty;
  readonly return: Empty;
}

export type TransitionTarget =
  | { readonly kind: 'step'; readonly step: string }
  | { readonly kind: 'terminal'; readonly outcome: TerminalOutcome };

export interface WorkflowTransition<A extends HostAnnotations = NoAnnotations> {
  readonly id: string;
  /** Selects the transition of a work step; absent on the only transition of a step. */
  readonly result?: string;
  readonly label?: string;
  readonly target: TransitionTarget;
  /** Whether what follows may continue on its own or waits for the owner (the host decides how). */
  readonly continuation: 'auto' | 'owner-action';
  readonly feedback: 'required' | 'optional';
  /** Wait steps only, and on every wait-step transition: the host event that takes it. */
  readonly on?: string;
  readonly annotations: A['transition'];
}

interface StepCommon<A extends HostAnnotations> {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly instructions?: string;
  readonly transitions: readonly WorkflowTransition<A>[];
}

export interface WorkStep<A extends HostAnnotations = NoAnnotations> extends StepCommon<A> {
  readonly kind: 'work';
  /** The executor classes that may work on the step (at least one, each once). */
  readonly executors: readonly ExecutorClass[];
  readonly annotations: A['work'];
}

/**
 * A step without work: entering it is part of the transition that leads to it, and a host event
 * (`on` of its transitions) completes it. Nobody starts it, and its attempts record no actor.
 */
export interface WaitStep<A extends HostAnnotations = NoAnnotations> extends StepCommon<A> {
  readonly kind: 'wait';
  readonly annotations: A['wait'];
}

export type WorkflowStep<A extends HostAnnotations = NoAnnotations> = WorkStep<A> | WaitStep<A>;

/** A step the owner may move the run back to, from any non-terminal position. */
export interface WorkflowReturn<A extends HostAnnotations = NoAnnotations> {
  readonly step: string;
  readonly label?: string;
  readonly feedback: 'required' | 'optional';
  readonly annotations: A['return'];
}

export interface WorkflowDefinition<A extends HostAnnotations = NoAnnotations> {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly entryStep: string;
  readonly steps: readonly WorkflowStep<A>[];
  readonly returns: readonly WorkflowReturn<A>[];
  readonly annotations: A['definition'];
}

export function findStep<A extends HostAnnotations>(
  definition: WorkflowDefinition<A>,
  id: string,
): WorkflowStep<A> | undefined {
  return definition.steps.find((step) => step.id === id);
}

/** A rule of the definition that is broken; `location` is a JSON pointer into the definition. */
export interface DefinitionProblem {
  readonly location: string;
  readonly message: string;
}

const problem = (location: string, message: string): DefinitionProblem => ({ location, message });

function transitionProblems<A extends HostAnnotations>(
  definition: WorkflowDefinition<A>,
  step: WorkflowStep<A>,
  at: string,
): DefinitionProblem[] {
  const problems: DefinitionProblem[] = [];
  const ids = new Set<string>();
  const results = new Set<string>();
  const triggers = new Set<string>();
  if (step.transitions.length === 0) {
    problems.push(problem(`${at}/transitions`, 'A step has at least one transition.'));
  }

  const unconditional = step.transitions.filter((transition) => transition.result === undefined);
  if (step.kind === 'work' && unconditional.length > 0 && step.transitions.length > 1) {
    problems.push(
      problem(
        `${at}/transitions`,
        'A step has either one transition without a result or only transitions with a result.',
      ),
    );
  }

  step.transitions.forEach((transition, index) => {
    const location = `${at}/transitions/${index}`;
    if (ids.has(transition.id)) {
      problems.push(problem(`${location}/id`, `The transition id "${transition.id}" is repeated.`));
    }

    ids.add(transition.id);
    if (transition.result !== undefined) {
      if (results.has(transition.result)) {
        problems.push(
          problem(
            `${location}/result`,
            `The result "${transition.result}" selects two transitions.`,
          ),
        );
      }

      results.add(transition.result);
    }

    const target =
      transition.target.kind === 'step' ? findStep(definition, transition.target.step) : undefined;
    if (transition.target.kind === 'step' && !target) {
      problems.push(
        problem(
          `${location}/to/step`,
          `The target step "${transition.target.step}" is not defined.`,
        ),
      );
    }

    if (step.kind === 'work') {
      if (transition.on !== undefined) {
        problems.push(problem(`${location}/on`, 'Only a wait-step transition has a trigger.'));
      }

      return;
    }

    // A wait step is completed by an event and enters what follows in the same change.
    if (transition.result !== undefined || target?.kind === 'wait') {
      problems.push(
        problem(
          location,
          'A wait-step transition has no result, and it does not lead to another wait step.',
        ),
      );
    }

    if (transition.on === undefined) {
      problems.push(problem(`${location}/on`, 'A wait-step transition names its trigger.'));
    } else if (triggers.has(transition.on)) {
      problems.push(problem(`${location}/on`, `Two transitions are taken on "${transition.on}".`));
    } else {
      triggers.add(transition.on);
    }
  });

  return problems;
}

function executorProblems(executors: readonly ExecutorClass[], at: string): DefinitionProblem[] {
  const known = new Set<string>(EXECUTOR_CLASSES);

  return executors.length === 0 ||
    new Set(executors).size !== executors.length ||
    executors.some((executor) => !known.has(executor))
    ? [problem(`${at}/executors`, 'A work step allows one or more executor classes, each once.')]
    : [];
}

/**
 * The neutral whole-definition rules: unique ids, existing targets, one way to select each
 * transition, the executors of every work step, the triggers of every wait step, and the entry and
 * the returns lead to work steps (nobody starts a wait step). A host adds its own rules on top.
 */
export function checkDefinition<A extends HostAnnotations>(
  definition: WorkflowDefinition<A>,
): DefinitionProblem[] {
  const problems: DefinitionProblem[] = [];
  const stepIds = new Set<string>();
  definition.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) {
      problems.push(problem(`/steps/${index}/id`, `The step id "${step.id}" is repeated.`));
    }

    stepIds.add(step.id);
  });
  const entry = findStep(definition, definition.entryStep);
  if (!entry) {
    problems.push(
      problem('/entryStep', `The entry step "${definition.entryStep}" is not defined.`),
    );
  } else if (entry.kind === 'wait') {
    problems.push(
      problem('/entryStep', `The entry step "${definition.entryStep}" is a wait step.`),
    );
  }

  definition.steps.forEach((step, index) => {
    const at = `/steps/${index}`;
    problems.push(
      ...(step.kind === 'work' ? executorProblems(step.executors, at) : []),
      ...transitionProblems(definition, step, at),
    );
  });

  const returnSteps = new Set<string>();
  definition.returns.forEach((entry, index) => {
    const at = `/returns/${index}/step`;
    const step = findStep(definition, entry.step);
    if (!step) {
      problems.push(problem(at, `The return step "${entry.step}" is not defined.`));
    } else if (step.kind === 'wait') {
      // A return waits for the owner to start its step, but nobody starts a wait step.
      problems.push(problem(at, `The return step "${entry.step}" is a wait step.`));
    }

    if (returnSteps.has(entry.step)) {
      problems.push(problem(at, `The return to "${entry.step}" is declared twice.`));
    }

    returnSteps.add(entry.step);
  });

  return problems;
}
