import { isDeepStrictEqual } from 'node:util';

import {
  findStep,
  type HostAnnotations,
  type TerminalOutcome,
  type WorkflowDefinition,
  type WorkflowReturn,
  type WorkflowStep,
  type WorkflowTransition,
  type WorkStep,
} from '../definitions/definition';
import { WorkflowError } from '../errors';
import { assertPositionJustified, lastArrival, positionAfter } from './replay';
import {
  activeAttempt,
  awaitingAttempt,
  historyOf,
  isReturnRecord,
  nextAttemptNumber,
  nextSequence,
  type ActorRecord,
  type AttemptConfirmation,
  type AttemptRecord,
  type WorkflowRun,
} from './run';
import { assertPinned } from '../definitions/revision';

/**
 * The deterministic coordinator of one run: given the pinned definition, the run and a command, it
 * chooses the legal step or transition and returns the next run and what the host should do next.
 * Pure: it performs no I/O, keeps no state and never runs work itself. The host stores `nextRun`
 * (together with its own effects, in one change) and acts on the intent.
 *
 * - `start` activates the next work step (or resumes the active attempt);
 * - `finish` completes the active work attempt with a transition and never starts the next step,
 *   except that a transition into a wait step enters it (a wait step has no work); a finish the host
 *   holds for a confirmation (`confirmation`) ends the attempt and leaves the run waiting at that
 *   transition (`awaiting-confirmation`) instead;
 * - `confirm` takes the held transition, as the finish would have; `reject` does not take it and
 *   returns the run to the attempt's step, ready to start, with the rejection's feedback;
 * - `event` completes the active wait step with the transition its trigger names;
 * - `return` moves the run back to a declared step it has already reached;
 * - `take-over` ends the active work attempt without a result and starts a new attempt of the same
 *   step for another actor, who goes on with the work as it stands.
 */

export type WorkflowCommand<TActor extends ActorRecord = ActorRecord> =
  | {
      readonly kind: 'start';
      readonly at: string;
      readonly actor: TActor;
      /** Recorded with the attempt the start activates; a resume keeps the active attempt's own. */
      readonly hostData?: unknown;
    }
  | {
      readonly kind: 'finish';
      readonly at: string;
      /** The attempt the caller worked on; a stale caller never completes a newer attempt. */
      readonly step: string;
      readonly attempt: number;
      readonly actor: TActor;
      readonly result?: string;
      readonly feedback?: string;
      readonly artifacts?: readonly string[];
      /**
       * The host's digest of this finish request. When the command names the run's last finished
       * work attempt with the same digest and actor, it is a retry: the recorded result is returned
       * and nothing changes; anything else naming that attempt is `WORKFLOW_ATTEMPT_MISMATCH`.
       */
      readonly requestDigest?: string;
      /**
       * The host holds this finish for a confirmation: the attempt ends with the transition, which
       * is not taken until a `confirm`. `hostData` is kept with the pending confirmation.
       */
      readonly confirmation?: { readonly hostData?: unknown };
    }
  | {
      /** Take the transition the attempt `step#attempt` ended with and the run waits at. */
      readonly kind: 'confirm';
      readonly at: string;
      readonly step: string;
      readonly attempt: number;
      readonly actor: TActor;
      /** See `reject`. */
      readonly requestDigest?: string;
    }
  | {
      /** Do not take it: the run returns to `step`, ready to start, with `feedback` (required). */
      readonly kind: 'reject';
      readonly at: string;
      readonly step: string;
      readonly attempt: number;
      readonly actor: TActor;
      readonly feedback: string;
      /**
       * The host's digest of this request. A confirm or reject naming an attempt whose confirmation
       * was decided by the same kind of request with the same digest and actor is a retry: nothing
       * changes (`replayed`); anything else naming it is `WORKFLOW_ATTEMPT_MISMATCH`.
       */
      readonly requestDigest?: string;
    }
  | {
      readonly kind: 'event';
      readonly at: string;
      /** The trigger name of a transition of the active wait step. */
      readonly name: string;
      readonly feedback?: string;
    }
  | {
      readonly kind: 'return';
      readonly at: string;
      readonly step: string;
      readonly feedback?: string;
    }
  | {
      readonly kind: 'take-over';
      readonly at: string;
      /** The active attempt the caller takes over; a stale caller never ends a newer attempt. */
      readonly step: string;
      readonly attempt: number;
      /** Who works on the new attempt; any actor of a class the step allows. */
      readonly actor: TActor;
      /** Recorded with the new attempt. */
      readonly hostData?: unknown;
    };

/** What the host should do with the run after the decision. */
export type WorkflowIntent =
  /** An attempt of a work step is active: its actor works on it. */
  | {
      readonly kind: 'execute';
      readonly step: string;
      readonly attempt: number;
      /** The attempt was already active (a repeated start). */
      readonly resumed: boolean;
    }
  /** `step` is the next to start; `continuation` says whether it may continue on its own. */
  | {
      readonly kind: 'ready';
      readonly step: string;
      readonly continuation: 'auto' | 'owner-action';
    }
  /** The active wait step waits for one of its trigger events. */
  | {
      readonly kind: 'await-event';
      readonly step: string;
      readonly attempt: number;
      readonly triggers: readonly string[];
    }
  /** The attempt ended with `transition`, which waits for a confirm or reject. */
  | {
      readonly kind: 'await-confirmation';
      readonly step: string;
      readonly attempt: number;
      readonly transition: string;
    }
  | { readonly kind: 'terminal'; readonly outcome: TerminalOutcome };

/** A transition taken or a return made by the decision, with its host annotations. */
export type DeclaredEffect<A extends HostAnnotations> =
  | {
      readonly source: 'transition';
      readonly step: string;
      readonly transition: WorkflowTransition<A>;
    }
  | { readonly source: 'return'; readonly entry: WorkflowReturn<A> };

export interface WorkflowDecision<A extends HostAnnotations, TActor extends ActorRecord> {
  readonly nextRun: WorkflowRun<TActor>;
  readonly intent: WorkflowIntent;
  /** In the order they happened; the host applies their annotations. Empty when nothing moved. */
  readonly declaredEffects: readonly DeclaredEffect<A>[];
  /**
   * For a finish: the attempt it finished (also on a retry); for a confirm or reject: the attempt
   * whose confirmation it decided.
   */
  readonly finished?: AttemptRecord<TActor>;
  /**
   * A finish that repeated the last finish, or a confirm or reject that repeated the recorded
   * decision: `nextRun` is the given run, unchanged.
   */
  readonly replayed?: true;
}

function stepOf<A extends HostAnnotations>(
  definition: WorkflowDefinition<A>,
  id: string,
): WorkflowStep<A> {
  const step = findStep(definition, id);
  if (!step) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The run refers to an unknown step "${id}".`);
  }

  return step;
}

function notAllowed(message: string): never {
  throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', message);
}

function invalidInput(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

const describeClass = (actor: ActorRecord) => (actor.class === 'agent' ? 'an agent' : 'a person');

/**
 * The executor policy of a work step: the actor's class is one the step allows, and an active
 * attempt is continued (resumed or finished) only by an actor of the class that started it, so a
 * person never finishes an agent's attempt and an agent never a person's. Which actor of that class
 * (for example the same Session) is the host's rule.
 */
function assertActorAllowed(
  step: WorkStep<HostAnnotations>,
  actor: ActorRecord,
  active: AttemptRecord | undefined,
): void {
  if (!step.executors.includes(actor.class)) {
    notAllowed(
      step.executors.includes('agent')
        ? `The step "${step.id}" is done by an agent, not by a person.`
        : `The step "${step.id}" is done by a person; an agent cannot do it.`,
    );
  }

  const started = active?.actor;
  if (started && started.class !== actor.class) {
    notAllowed(
      `The active attempt of "${step.id}" is worked on by ${describeClass(started)}; ${describeClass(actor)} cannot continue or finish it.`,
    );
  }
}

/** The intent of a run as it stands: what the host does next with it. */
export function intentOf<A extends HostAnnotations>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun,
): WorkflowIntent {
  const position = run.position;
  switch (position.state) {
    case 'terminal':
      return { kind: 'terminal', outcome: position.outcome };
    case 'not-started':
      return { kind: 'ready', step: definition.entryStep, continuation: 'owner-action' };
    case 'active': {
      const step = stepOf(definition, position.step);

      return step.kind === 'wait'
        ? {
            kind: 'await-event',
            step: step.id,
            attempt: position.attempt,
            triggers: step.transitions.flatMap((transition) =>
              transition.on !== undefined ? [transition.on] : [],
            ),
          }
        : { kind: 'execute', step: step.id, attempt: position.attempt, resumed: true };
    }

    case 'awaiting-confirmation': {
      const outcome = awaitingAttempt(run)?.outcome;
      if (outcome?.kind !== 'transition') {
        throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The awaited attempt has no transition.');
      }

      return {
        kind: 'await-confirmation',
        step: position.step,
        attempt: position.attempt,
        transition: outcome.transition,
      };
    }

    case 'ready': {
      const arrival = lastArrival(run, definition);

      return {
        kind: 'ready',
        step: position.step,
        continuation:
          arrival?.kind === 'transition' ? arrival.transition.continuation : 'owner-action',
      };
    }
  }
}

function selectTransition<A extends HostAnnotations>(
  step: WorkflowStep<A>,
  result: string | undefined,
): WorkflowTransition<A> {
  const [only] = step.transitions;
  if (only && only.result === undefined) {
    if (result !== undefined) {
      invalidInput(
        `The step "${step.id}" takes no result, but "${result.slice(0, 80)}" was given; finish it without a result${
          only.label !== undefined ? ` (it finishes as "${only.label}")` : ''
        }.`,
      );
    }

    return only;
  }

  const selected = step.transitions.find((transition) => transition.result === result);
  if (!selected) {
    // Each allowed value with its label and whether it needs feedback, so the caller can choose.
    const allowed = step.transitions
      .map(
        (transition) =>
          `${String(transition.result)}${transition.label !== undefined ? ` ("${transition.label}"` : ' ('}${
            transition.label !== undefined ? ', ' : ''
          }feedback ${transition.feedback})`,
      )
      .join(', ');
    invalidInput(
      `The step "${step.id}" needs one of the results ${allowed}; got ${
        result === undefined ? 'none' : `"${result.slice(0, 80)}"`
      }.`,
    );
  }

  return selected;
}

function activate<TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
  step: string,
  at: string,
  actor: TActor | undefined,
  hostData?: unknown,
): WorkflowRun<TActor> {
  const attempt = nextAttemptNumber(run, step);

  return {
    ...run,
    position: { state: 'active', step, attempt },
    attempts: [
      ...run.attempts,
      {
        step,
        attempt,
        sequence: nextSequence(run),
        startedAt: at,
        ...(actor ? { actor } : {}),
        ...(hostData !== undefined ? { hostData } : {}),
      },
    ],
  };
}

interface Completion<TActor extends ActorRecord> {
  readonly at: string;
  readonly result?: string;
  readonly feedback?: string;
  readonly artifacts?: readonly string[];
  readonly finishedBy?: TActor;
  readonly requestDigest?: string;
  /** Hold the transition for a confirmation instead of taking it. */
  readonly confirmation?: { readonly hostData?: unknown };
}

/**
 * End the active attempt with `transition` and move the run where it leads; a transition into a
 * wait step enters it in the same decision.
 */
function complete<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  step: WorkflowStep<A>,
  transition: WorkflowTransition<A>,
  completion: Completion<TActor>,
): WorkflowDecision<A, TActor> {
  if (transition.feedback === 'required' && !completion.feedback?.trim()) {
    invalidInput(`The transition "${transition.id}" requires feedback.`);
  }

  const current = activeAttempt(run);
  if (!current) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The active attempt has no history record.');
  }

  const feedback = completion.feedback?.trim();
  const finished: AttemptRecord<TActor> = {
    ...current,
    endedAt: completion.at,
    ...(completion.finishedBy ? { finishedBy: completion.finishedBy } : {}),
    ...(completion.requestDigest !== undefined ? { requestDigest: completion.requestDigest } : {}),
    outcome: {
      kind: 'transition',
      transition: transition.id,
      ...(completion.result !== undefined ? { result: completion.result } : {}),
      ...(feedback ? { feedback } : {}),
      artifacts: [...(completion.artifacts ?? [])],
    },
  };
  const hold = completion.confirmation;
  if (hold) {
    const held: AttemptRecord<TActor> = {
      ...finished,
      confirmation: {
        state: 'pending',
        ...(hold.hostData !== undefined ? { hostData: hold.hostData } : {}),
      },
    };
    const nextRun: WorkflowRun<TActor> = {
      ...run,
      position: { state: 'awaiting-confirmation', step: step.id, attempt: current.attempt },
      attempts: run.attempts.map((record) => (record === current ? held : record)),
    };

    return { nextRun, intent: intentOf(definition, nextRun), declaredEffects: [], finished: held };
  }

  return moveAlong(definition, run, step, transition, current, finished, completion.at);
}

/**
 * Replace the attempt record `current` with `finished` and move the run where `transition` leads;
 * a transition into a wait step enters it in the same decision.
 */
function moveAlong<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  step: WorkflowStep<A>,
  transition: WorkflowTransition<A>,
  current: AttemptRecord<TActor>,
  finished: AttemptRecord<TActor>,
  at: string,
): WorkflowDecision<A, TActor> {
  const moved: WorkflowRun<TActor> = {
    ...run,
    position: positionAfter(transition),
    attempts: run.attempts.map((record) => (record === current ? finished : record)),
  };
  const next =
    transition.target.kind === 'step' ? stepOf(definition, transition.target.step) : undefined;
  const nextRun = next?.kind === 'wait' ? activate(moved, next.id, at, undefined) : moved;

  return {
    nextRun,
    intent: intentOf(definition, nextRun),
    declaredEffects: [{ source: 'transition', step: step.id, transition }],
    finished,
  };
}

function decideStart<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'start' }>,
): WorkflowDecision<A, TActor> {
  const position = run.position;
  if (position.state === 'terminal') {
    return { nextRun: run, intent: intentOf(definition, run), declaredEffects: [] };
  }

  const step = stepOf(
    definition,
    position.state === 'not-started' ? definition.entryStep : position.step,
  );
  if (position.state === 'awaiting-confirmation') {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      `The result of ${position.step}#${String(position.attempt)} waits for a confirmation; confirm or reject it first.`,
    );
  }

  // A wait step is entered by the transition that leads to it and completed by an event.
  if (step.kind === 'wait') {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      `The wait step "${step.id}" is not started; an event completes it.`,
    );
  }

  assertActorAllowed(step, command.actor, activeAttempt(run));
  if (position.state === 'active') {
    return {
      nextRun: run,
      intent: { kind: 'execute', step: step.id, attempt: position.attempt, resumed: true },
      declaredEffects: [],
    };
  }

  const nextRun = activate(run, step.id, command.at, command.actor, command.hostData);

  return {
    nextRun,
    intent: {
      kind: 'execute',
      step: step.id,
      attempt: nextAttemptNumber(run, step.id),
      resumed: false,
    },
    declaredEffects: [],
  };
}

/**
 * The last event an actor or the owner caused: the latest record, skipping the attempts of wait
 * steps the coordinator entered (and an event completed, or that are still waiting). A wait attempt
 * the owner ended with a return is such an event, like a return record.
 */
function lastActedRecord<TActor extends ActorRecord>(
  definition: WorkflowDefinition<HostAnnotations>,
  run: WorkflowRun<TActor>,
) {
  return historyOf(run)
    .filter(
      (record) =>
        isReturnRecord(record) ||
        findStep(definition, record.step)?.kind !== 'wait' ||
        record.outcome?.kind === 'returned',
    )
    .at(-1);
}

/**
 * A finish naming an attempt that already ended: the retry of the run's last finish (same digest
 * and actor) returns the recorded result; anything else, also after any later event, is
 * `WORKFLOW_ATTEMPT_MISMATCH`. `undefined` when the command names no ended attempt.
 */
function repeatedFinish<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'finish' }>,
): WorkflowDecision<A, TActor> | undefined {
  const ended = run.attempts.find(
    (record) =>
      record.step === command.step &&
      record.attempt === command.attempt &&
      record.outcome !== undefined,
  );
  if (!ended) {
    return undefined;
  }

  const last = lastActedRecord(definition, run);
  if (
    last !== ended ||
    ended.outcome?.kind !== 'transition' ||
    command.requestDigest === undefined ||
    ended.requestDigest !== command.requestDigest ||
    !isDeepStrictEqual(ended.finishedBy, command.actor)
  ) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `The attempt ${command.step}#${String(command.attempt)} already ended; this finish is not a retry of the run's last finish.`,
    );
  }

  return {
    nextRun: run,
    intent: intentOf(definition, run),
    declaredEffects: [],
    finished: ended,
    replayed: true,
  };
}

function decideFinish<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'finish' }>,
): WorkflowDecision<A, TActor> {
  const position = run.position;
  const named =
    position.state === 'active' &&
    position.step === command.step &&
    position.attempt === command.attempt;
  const repeated = named ? undefined : repeatedFinish(definition, run, command);
  if (repeated) {
    return repeated;
  }

  if (position.state !== 'active') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No step is active.');
  }

  if (!named) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `The active attempt is ${position.step}#${String(position.attempt)}, not ${command.step}#${String(command.attempt)}.`,
    );
  }

  const step = stepOf(definition, position.step);
  if (step.kind === 'wait') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'A wait step is completed by an event.');
  }

  const transition = selectTransition(step, command.result);
  if (transition.feedback === 'required' && !command.feedback?.trim()) {
    invalidInput(`The transition "${transition.id}" requires feedback.`);
  }

  assertActorAllowed(step, command.actor, activeAttempt(run));

  return complete(definition, run, step, transition, {
    at: command.at,
    finishedBy: command.actor,
    ...(command.result !== undefined ? { result: command.result } : {}),
    ...(command.feedback !== undefined ? { feedback: command.feedback } : {}),
    ...(command.artifacts !== undefined ? { artifacts: command.artifacts } : {}),
    ...(command.requestDigest !== undefined ? { requestDigest: command.requestDigest } : {}),
    ...(command.confirmation ? { confirmation: command.confirmation } : {}),
  });
}

type ConfirmationCommand<TActor extends ActorRecord> = Extract<
  WorkflowCommand<TActor>,
  { kind: 'confirm' | 'reject' }
>;

/**
 * The attempt a confirm or reject names, with its pending confirmation and transition; or, for a
 * retry of the decision recorded on it (same kind, digest and actor), the replayed decision.
 */
function confirmationTarget<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: ConfirmationCommand<TActor>,
):
  | { readonly replayed: WorkflowDecision<A, TActor> }
  | { readonly record: AttemptRecord<TActor>; readonly transition: string } {
  const named = `${command.step}#${String(command.attempt)}`;
  const record = run.attempts.find(
    (candidate) => candidate.step === command.step && candidate.attempt === command.attempt,
  );
  const decided = record?.confirmation;
  if (record && decided && decided.state !== 'pending') {
    const retry =
      decided.state === (command.kind === 'confirm' ? 'confirmed' : 'rejected') &&
      command.requestDigest !== undefined &&
      decided.requestDigest === command.requestDigest &&
      isDeepStrictEqual(decided.actor, command.actor);
    if (!retry) {
      throw new WorkflowError(
        'WORKFLOW_ATTEMPT_MISMATCH',
        `The result of ${named} was ${decided.state} already; this request is not a retry of that decision.`,
      );
    }

    return {
      replayed: {
        nextRun: run,
        intent: intentOf(definition, run),
        declaredEffects: [],
        finished: record,
        replayed: true,
      },
    };
  }

  const position = run.position;
  if (position.state !== 'awaiting-confirmation') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No result waits for a confirmation.');
  }

  const awaited = awaitingAttempt(run);
  if (!awaited || awaited !== record) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `The result waiting for a confirmation is ${position.step}#${String(position.attempt)}, not ${named}.`,
    );
  }

  if (awaited.outcome?.kind !== 'transition' || awaited.confirmation?.state !== 'pending') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The awaited attempt has no pending result.');
  }

  return { record: awaited, transition: awaited.outcome.transition };
}

function decideConfirmation<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: ConfirmationCommand<TActor>,
): WorkflowDecision<A, TActor> {
  const feedback = command.kind === 'reject' ? command.feedback.trim() : '';
  if (command.kind === 'reject' && !feedback) {
    invalidInput('Rejecting a result needs feedback: what should change.');
  }

  const target = confirmationTarget(definition, run, command);
  if ('replayed' in target) {
    return target.replayed;
  }

  const { record } = target;
  const pending = record.confirmation as Extract<AttemptConfirmation, { state: 'pending' }>;
  const decided = {
    ...(pending.hostData !== undefined ? { hostData: pending.hostData } : {}),
    at: command.at,
    actor: command.actor,
    ...(command.requestDigest !== undefined ? { requestDigest: command.requestDigest } : {}),
  };
  const step = stepOf(definition, record.step);
  if (command.kind === 'reject') {
    const rejected: AttemptRecord<TActor> = {
      ...record,
      confirmation: { state: 'rejected', ...decided, feedback },
    };
    const nextRun: WorkflowRun<TActor> = {
      ...run,
      position: { state: 'ready', step: step.id },
      attempts: run.attempts.map((candidate) => (candidate === record ? rejected : candidate)),
    };

    return {
      nextRun,
      intent: { kind: 'ready', step: step.id, continuation: 'owner-action' },
      declaredEffects: [],
      finished: rejected,
    };
  }

  const transition = step.transitions.find((candidate) => candidate.id === target.transition);
  if (!transition) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The run refers to an unknown transition "${target.transition}" of the step "${step.id}".`,
    );
  }

  const confirmed: AttemptRecord<TActor> = {
    ...record,
    confirmation: { state: 'confirmed', ...decided },
  };

  return moveAlong(definition, run, step, transition, record, confirmed, command.at);
}

function decideEvent<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'event' }>,
): WorkflowDecision<A, TActor> {
  const position = run.position;
  const step = position.state === 'active' ? stepOf(definition, position.step) : undefined;
  if (step?.kind !== 'wait') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No wait step is active.');
  }

  // A trigger the wait step declares no transition for leaves the run waiting.
  const transition = step.transitions.find((candidate) => candidate.on === command.name);
  if (!transition) {
    return { nextRun: run, intent: intentOf(definition, run), declaredEffects: [] };
  }

  return complete(definition, run, step, transition, {
    at: command.at,
    ...(command.feedback !== undefined ? { feedback: command.feedback } : {}),
  });
}

function decideReturn<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'return' }>,
): WorkflowDecision<A, TActor> {
  if (run.position.state === 'terminal') {
    throw new WorkflowError('WORKFLOW_RETURN_NOT_ALLOWED', 'A finished run cannot return.');
  }

  if (run.position.state === 'awaiting-confirmation') {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      'A result waits for a confirmation; confirm or reject it (a rejection returns to its step).',
    );
  }

  const entry = definition.returns.find((candidate) => candidate.step === command.step);
  if (!entry) {
    throw new WorkflowError(
      'WORKFLOW_RETURN_NOT_ALLOWED',
      `The workflow "${definition.id}" declares no return to "${command.step}".`,
    );
  }

  // A return goes back to work the run has done, never ahead to a step it has not reached.
  if (!run.attempts.some((record) => record.step === command.step)) {
    throw new WorkflowError(
      'WORKFLOW_RETURN_NOT_ALLOWED',
      `The run has not reached "${command.step}" yet, so it cannot return there.`,
    );
  }

  const text = command.feedback?.trim();
  if (entry.feedback === 'required' && !text) {
    invalidInput(`A return to "${command.step}" requires feedback.`);
  }

  const current = activeAttempt(run);
  const position = { state: 'ready', step: entry.step } as const;
  const nextRun: WorkflowRun<TActor> = current
    ? {
        ...run,
        position,
        attempts: run.attempts.map((record) =>
          record === current
            ? {
                ...record,
                endedAt: command.at,
                outcome: { kind: 'returned', to: entry.step, ...(text ? { feedback: text } : {}) },
              }
            : record,
        ),
      }
    : {
        ...run,
        position,
        returns: [
          ...run.returns,
          {
            sequence: nextSequence(run),
            at: command.at,
            from: run.position,
            to: entry.step,
            ...(text ? { feedback: text } : {}),
          },
        ],
      };

  return {
    nextRun,
    intent: { kind: 'ready', step: entry.step, continuation: 'owner-action' },
    declaredEffects: [{ source: 'return', entry }],
  };
}

function decideTakeOver<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: Extract<WorkflowCommand<TActor>, { kind: 'take-over' }>,
): WorkflowDecision<A, TActor> {
  const position = run.position;
  if (position.state !== 'active') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No step is active.');
  }

  if (position.step !== command.step || position.attempt !== command.attempt) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `The active attempt is ${position.step}#${String(position.attempt)}, not ${command.step}#${String(command.attempt)}.`,
    );
  }

  const step = stepOf(definition, position.step);
  if (step.kind === 'wait') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'Nobody works on a wait step.');
  }

  // The new actor's class must be one the step allows; it need not be the class that started.
  assertActorAllowed(step, command.actor, undefined);
  const current = activeAttempt(run);
  if (!current) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The active attempt has no history record.');
  }

  const ended: WorkflowRun<TActor> = {
    ...run,
    attempts: run.attempts.map((record) =>
      record === current
        ? { ...record, endedAt: command.at, outcome: { kind: 'taken-over' } }
        : record,
    ),
  };
  const nextRun = activate(ended, step.id, command.at, command.actor, command.hostData);

  return {
    nextRun,
    intent: {
      kind: 'execute',
      step: step.id,
      attempt: nextAttemptNumber(ended, step.id),
      resumed: false,
    },
    declaredEffects: [],
  };
}

/**
 * Decide one command on one run. The run must be pinned to `definition`
 * (`WORKFLOW_DEFINITION_CHANGED` otherwise) and its position must follow from its history
 * (`WORKFLOW_STATE_CORRUPT` otherwise). Throws a {@link WorkflowError} when the command is not
 * legal; nothing is decided then.
 */
export function decide<A extends HostAnnotations, TActor extends ActorRecord>(
  definition: WorkflowDefinition<A>,
  run: WorkflowRun<TActor>,
  command: WorkflowCommand<TActor>,
): WorkflowDecision<A, TActor> {
  assertPinned(run.workflow, definition);
  assertPositionJustified(run, definition);
  switch (command.kind) {
    case 'start':
      return decideStart(definition, run, command);
    case 'finish':
      return decideFinish(definition, run, command);
    case 'event':
      return decideEvent(definition, run, command);
    case 'confirm':
    case 'reject':
      return decideConfirmation(definition, run, command);
    case 'return':
      return decideReturn(definition, run, command);
    case 'take-over':
      return decideTakeOver(definition, run, command);
  }
}
