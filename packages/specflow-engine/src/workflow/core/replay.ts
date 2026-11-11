import { isDeepStrictEqual } from 'node:util';

import {
  findStep,
  type HostAnnotations,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowTransition,
} from './definition';
import { WorkflowError } from './errors';
import {
  historyOf,
  isReturnRecord,
  type ActorRecord,
  type AttemptRecord,
  type RunPosition,
  type WorkflowRun,
} from './run';

/** Where a transition leads: the next step, ready to start, or the end of the run. */
export function positionAfter(transition: WorkflowTransition<HostAnnotations>): RunPosition {
  return transition.target.kind === 'step'
    ? { state: 'ready', step: transition.target.step }
    : { state: 'terminal', outcome: transition.target.outcome };
}

function attemptFollows(
  step: WorkflowStep<HostAnnotations>,
  record: AttemptRecord<ActorRecord>,
): boolean {
  const outcome = record.outcome;
  if (step.kind === 'wait') {
    // The coordinator enters and completes a wait step: nobody works on it.
    return (
      record.actor === undefined &&
      record.finishedBy === undefined &&
      record.requestDigest === undefined
    );
  }

  const actor = record.actor;
  if (!actor || !step.executors.includes(actor.class)) {
    return false;
  }

  // Only a finish records who finished (an actor of the attempt's class) and its request digest.
  return outcome?.kind === 'transition'
    ? record.finishedBy?.class === actor.class
    : record.finishedBy === undefined && record.requestDigest === undefined;
}

/**
 * The stored position must follow from the history, read with the pinned definition, under the rules
 * the coordinator applies when it writes it. The records (attempts and returns) are replayed in
 * sequence order from `not-started`:
 *
 * - the first attempt is of the entry step and every later one of the step the previous record led
 *   to; a transition into a wait step enters it, so the next record is an attempt of that wait step;
 *   an open attempt makes the run active on it, so it can only be the last record;
 * - an attempt of a work step carries an actor whose class the step allows, and when it finished
 *   with a transition, who finished it, of the same class; an attempt of a wait step carries no actor;
 * - a finished attempt leads where its recorded transition of that step targets, with the result
 *   the transition declares (none when it declares none) and feedback when the transition requires
 *   it;
 * - an attempt ended by a return, and a return record (written only while no attempt is active, from
 *   the position it records), lead to the return's step; it is a return the definition declares, to a
 *   step an attempt replayed so far (the returned attempt included) was of, with feedback when the
 *   return requires it.
 *
 * The position the replay ends at must be the stored one. Anything else is a hand-edited or foreign
 * record.
 */
export function isPositionJustified<A extends HostAnnotations>(
  run: WorkflowRun,
  definition: WorkflowDefinition<A>,
): boolean {
  const reached = new Set<string>();
  const returnAllowed = (to: string, feedback: string | undefined) => {
    const entry = definition.returns.find((candidate) => candidate.step === to);

    return (
      entry !== undefined &&
      reached.has(to) &&
      (entry.feedback !== 'required' || Boolean(feedback?.trim()))
    );
  };

  let expected: RunPosition = { state: 'not-started' };
  let entering = false;
  for (const record of historyOf(run)) {
    if (isReturnRecord(record)) {
      if (
        entering ||
        expected.state === 'active' ||
        expected.state === 'terminal' ||
        !isDeepStrictEqual(record.from, expected) ||
        !returnAllowed(record.to, record.feedback)
      ) {
        return false;
      }

      expected = { state: 'ready', step: record.to };
      continue;
    }

    const starts: string | undefined =
      expected.state === 'not-started'
        ? definition.entryStep
        : expected.state === 'ready'
          ? expected.step
          : undefined;
    const step: WorkflowStep<A> | undefined =
      record.step === starts ? findStep(definition, record.step) : undefined;
    if (!step || !attemptFollows(step, record)) {
      return false;
    }

    entering = false;
    reached.add(step.id);
    const outcome = record.outcome;
    if (!outcome) {
      expected = { state: 'active', step: step.id, attempt: record.attempt };
      continue;
    }

    if (outcome.kind === 'returned') {
      if (!returnAllowed(outcome.to, outcome.feedback)) {
        return false;
      }

      expected = { state: 'ready', step: outcome.to };
      continue;
    }

    const transition = step.transitions.find((candidate) => candidate.id === outcome.transition);
    if (
      !transition ||
      outcome.result !== transition.result ||
      (transition.feedback === 'required' && !outcome.feedback?.trim())
    ) {
      return false;
    }

    expected = positionAfter(transition);
    entering =
      transition.target.kind === 'step' &&
      findStep(definition, transition.target.step)?.kind === 'wait';
  }

  return !entering && isDeepStrictEqual(expected, run.position);
}

/** {@link isPositionJustified}, failing with `WORKFLOW_STATE_CORRUPT`. */
export function assertPositionJustified<A extends HostAnnotations>(
  run: WorkflowRun,
  definition: WorkflowDefinition<A>,
): void {
  if (!isPositionJustified(run, definition)) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The stored position ${JSON.stringify(run.position)} does not follow from the run's history.`,
    );
  }
}

/** The last event of a run's history (by sequence), read with the run's pinned definition. */
export type RunArrival<A extends HostAnnotations, TActor extends ActorRecord> =
  /** The last attempt is still active. */
  | { readonly kind: 'active' }
  /** An owner return, recorded on its own or as the outcome of the attempt it ended. */
  | { readonly kind: 'return'; readonly to: string }
  /** An attempt finished with this transition. */
  | {
      readonly kind: 'transition';
      readonly step: string;
      readonly transition: WorkflowTransition<A>;
      readonly finishedBy?: TActor;
    };

/** `undefined` when the run has no history yet. */
export function lastArrival<A extends HostAnnotations, TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
  definition: WorkflowDefinition<A>,
): RunArrival<A, TActor> | undefined {
  const last = historyOf(run).at(-1);
  if (!last) {
    return undefined;
  }

  if (isReturnRecord(last)) {
    return { kind: 'return', to: last.to };
  }

  const outcome = last.outcome;
  if (!outcome) {
    return { kind: 'active' };
  }

  if (outcome.kind === 'returned') {
    return { kind: 'return', to: outcome.to };
  }

  const transition = findStep(definition, last.step)?.transitions.find(
    (candidate) => candidate.id === outcome.transition,
  );
  if (!transition) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The run refers to an unknown transition "${outcome.transition}" of the step "${last.step}".`,
    );
  }

  return {
    kind: 'transition',
    step: last.step,
    transition,
    ...(last.finishedBy ? { finishedBy: last.finishedBy } : {}),
  };
}

/**
 * What the next step receives from the previous one: the last finished attempt's transition result,
 * feedback and artifacts, or the owner's return feedback when the run was moved back.
 */
export type Handoff =
  | {
      readonly kind: 'transition';
      readonly from: { readonly step: string; readonly attempt: number };
      readonly transition: string;
      readonly result?: string;
      readonly feedback?: string;
      readonly artifacts: readonly string[];
    }
  | { readonly kind: 'return'; readonly at: string; readonly feedback?: string };

/**
 * The last event decides, by record sequence. A return record is only written while no attempt is
 * active, so every attempt with a lower sequence had already ended when the owner returned.
 */
export function handoffOf(run: WorkflowRun): Handoff | undefined {
  const last = historyOf(run)
    .filter((record) => isReturnRecord(record) || record.outcome !== undefined)
    .at(-1);
  if (!last) {
    return undefined;
  }

  if (isReturnRecord(last)) {
    return { kind: 'return', at: last.at, ...(last.feedback ? { feedback: last.feedback } : {}) };
  }

  const outcome = last.outcome;
  if (!outcome) {
    return undefined;
  }

  if (outcome.kind === 'returned') {
    return {
      kind: 'return',
      at: last.endedAt ?? last.startedAt,
      ...(outcome.feedback ? { feedback: outcome.feedback } : {}),
    };
  }

  return {
    kind: 'transition',
    from: { step: last.step, attempt: last.attempt },
    transition: outcome.transition,
    ...(outcome.result !== undefined ? { result: outcome.result } : {}),
    ...(outcome.feedback !== undefined ? { feedback: outcome.feedback } : {}),
    artifacts: outcome.artifacts,
  };
}
