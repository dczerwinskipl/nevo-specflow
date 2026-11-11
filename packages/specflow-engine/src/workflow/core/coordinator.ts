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
} from './definition';
import { WorkflowError } from './errors';
import { assertPositionJustified, lastArrival, positionAfter } from './replay';
import {
  activeAttempt,
  historyOf,
  isReturnRecord,
  nextAttemptNumber,
  nextSequence,
  type ActorRecord,
  type AttemptRecord,
  type WorkflowRun,
} from './run';
import { assertPinned } from './revision';

/**
 * The deterministic coordinator of one run: given the pinned definition, the run and a command, it
 * chooses the legal step or transition and returns the next run and what the host should do next.
 * Pure: it performs no I/O, keeps no state and never runs work itself. The host stores `nextRun`
 * (together with its own effects, in one change) and acts on the intent.
 *
 * - `start` activates the next work step (or resumes the active attempt);
 * - `finish` completes the active work attempt with a transition and never starts the next step,
 *   except that a transition into a wait step enters it (a wait step has no work);
 * - `event` completes the active wait step with the transition its trigger names;
 * - `return` moves the run back to a declared step it has already reached.
 */

export type WorkflowCommand<TActor extends ActorRecord = ActorRecord> =
  | { readonly kind: 'start'; readonly at: string; readonly actor: TActor }
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
  /** For a finish: the attempt it finished (also on a retry). */
  readonly finished?: AttemptRecord<TActor>;
  /** A finish that repeated the last finish: `nextRun` is the given run, unchanged. */
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
      invalidInput(`The step "${step.id}" takes no result, but "${result}" was given.`);
    }

    return only;
  }

  const selected = step.transitions.find((transition) => transition.result === result);
  if (!selected) {
    const allowed = step.transitions.map((transition) => transition.result).join(', ');
    invalidInput(
      `The step "${step.id}" needs one of the results ${allowed}; got ${result ?? 'none'}.`,
    );
  }

  return selected;
}

function activate<TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
  step: string,
  at: string,
  actor: TActor | undefined,
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
  const moved: WorkflowRun<TActor> = {
    ...run,
    position: positionAfter(transition),
    attempts: run.attempts.map((record) => (record === current ? finished : record)),
  };
  const next =
    transition.target.kind === 'step' ? stepOf(definition, transition.target.step) : undefined;
  const nextRun =
    next?.kind === 'wait' ? activate(moved, next.id, completion.at, undefined) : moved;

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

  const nextRun = activate(run, step.id, command.at, command.actor);

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
  });
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
    case 'return':
      return decideReturn(definition, run, command);
  }
}
