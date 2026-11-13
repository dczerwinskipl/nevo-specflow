import type {
  ExecutorClass,
  HostAnnotations,
  TerminalOutcome,
  WorkflowDefinition,
} from '../definitions/definition';
import { pinOf, type WorkflowPin } from '../definitions/revision';
import { WorkflowError } from '../errors';

/**
 * One run of a definition: its pin, its position and its history. Only these are stored; anything a
 * host shows (readiness, lanes, attention) is derived. The core never sees whose run it is: a host
 * keeps each run under its own key and hands the core the run value.
 */

/**
 * - `not-started`: the next start activates the entry step;
 * - `active`: one attempt of one step is in progress;
 * - `ready`: the previous step finished (or the owner returned) and `step` is the next to start;
 * - `terminal`: the run ended.
 */
export type RunPosition =
  | { readonly state: 'not-started' }
  | { readonly state: 'active'; readonly step: string; readonly attempt: number }
  | { readonly state: 'ready'; readonly step: string }
  | { readonly state: 'terminal'; readonly outcome: TerminalOutcome };

/**
 * Who works on an attempt: its executor class, which the core checks against the step, and details
 * only the host interprets (for example a provider and Session, or a person's id and how they were
 * identified). The host supplies it from trusted context, never from the worker's own input.
 */
export interface ActorRecord {
  readonly class: ExecutorClass;
  readonly details: unknown;
}

export type AttemptOutcome =
  | {
      readonly kind: 'transition';
      readonly transition: string;
      readonly result?: string;
      readonly feedback?: string;
      readonly artifacts: readonly string[];
    }
  /** The owner returned the run to an earlier step while this attempt was active. */
  | { readonly kind: 'returned'; readonly to: string; readonly feedback?: string }
  /** The run was abandoned while this attempt was active (`abandonRun`). */
  | { readonly kind: 'abandoned' };

export interface AttemptRecord<TActor extends ActorRecord = ActorRecord> {
  readonly step: string;
  readonly attempt: number;
  /**
   * Order of the record among the run's attempts and returns (1, 2, ...). It decides which event came
   * last; timestamps do not, because clocks can repeat or go back.
   */
  readonly sequence: number;
  readonly startedAt: string;
  /** Who works on a work-step attempt; a wait-step attempt has none. */
  readonly actor?: TActor;
  /** Absent while the attempt is active. */
  readonly endedAt?: string;
  /** Who finished a work-step attempt (of the class of `actor`). */
  readonly finishedBy?: TActor;
  /** The host's digest of the finish request, so a retry of the same finish is recognized. */
  readonly requestDigest?: string;
  readonly outcome?: AttemptOutcome;
}

/** An owner return from a non-active position (no attempt was running). */
export interface ReturnRecord {
  /** See {@link AttemptRecord.sequence}. */
  readonly sequence: number;
  readonly at: string;
  readonly from: RunPosition;
  readonly to: string;
  readonly feedback?: string;
}

/**
 * The run was ended early, without reaching a terminal step: `abandoned` from whatever position it
 * had (`from`). It is the last record of a run (its sequence follows every attempt and return); an
 * attempt that was active then ends with the outcome `abandoned`. Who ended it and why are recorded;
 * the core does not interpret either beyond requiring a reason.
 */
export interface RunAbandonment<TActor extends ActorRecord = ActorRecord> {
  /** See {@link AttemptRecord.sequence}. */
  readonly sequence: number;
  readonly at: string;
  readonly from: RunPosition;
  readonly actor: TActor;
  readonly reason: string;
}

export interface WorkflowRun<TActor extends ActorRecord = ActorRecord> {
  readonly workflow: WorkflowPin;
  readonly position: RunPosition;
  readonly attempts: readonly AttemptRecord<TActor>[];
  readonly returns: readonly ReturnRecord[];
  /** Present once the run was abandoned (`abandonRun`); its position is then terminal `abandoned`. */
  readonly abandonment?: RunAbandonment<TActor>;
}

/** A run of `definition` that has not started, pinned to it. */
export function newRun<TActor extends ActorRecord = ActorRecord>(
  definition: WorkflowDefinition<HostAnnotations>,
): WorkflowRun<TActor> {
  return {
    workflow: pinOf(definition),
    position: { state: 'not-started' },
    attempts: [],
    returns: [],
  };
}

export function nextAttemptNumber(run: WorkflowRun, step: string): number {
  return (
    run.attempts.reduce(
      (highest, record) => (record.step === step ? Math.max(highest, record.attempt) : highest),
      0,
    ) + 1
  );
}

/** The sequence of the next attempt or return record of a run. */
export function nextSequence(run: WorkflowRun): number {
  return (
    [...run.attempts, ...run.returns].reduce(
      (highest, record) => Math.max(highest, record.sequence),
      0,
    ) + 1
  );
}

export function activeAttempt<TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
): AttemptRecord<TActor> | undefined {
  const position = run.position;
  if (position.state !== 'active') {
    return undefined;
  }

  return run.attempts.find(
    (record) => record.step === position.step && record.attempt === position.attempt,
  );
}

/** The run's records (attempts and returns) in the order they were made. */
export function historyOf<TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
): (AttemptRecord<TActor> | ReturnRecord)[] {
  return [...run.attempts, ...run.returns].sort((left, right) => left.sequence - right.sequence);
}

export const isReturnRecord = (
  record: AttemptRecord<ActorRecord> | ReturnRecord,
): record is ReturnRecord => 'from' in record;

/**
 * End a run that is not terminal yet as `abandoned`, from any position (also `not-started`), with who
 * ended it and why. Needs no definition: nothing is chosen, the run only stops. A terminal run cannot
 * be abandoned (`WORKFLOW_POSITION_INVALID`); an empty reason is `WORKFLOW_INPUT_INVALID`.
 */
export function abandonRun<TActor extends ActorRecord>(
  run: WorkflowRun<TActor>,
  command: { readonly at: string; readonly actor: TActor; readonly reason: string },
): WorkflowRun<TActor> {
  if (run.position.state === 'terminal') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'The run has ended already.');
  }

  if (!command.reason.trim()) {
    throw new WorkflowError('WORKFLOW_INPUT_INVALID', 'Abandoning a run needs a reason.');
  }

  const position = run.position;

  return {
    ...run,
    attempts: run.attempts.map((record) =>
      position.state === 'active' &&
      record.step === position.step &&
      record.attempt === position.attempt
        ? { ...record, endedAt: command.at, outcome: { kind: 'abandoned' } }
        : record,
    ),
    position: { state: 'terminal', outcome: 'abandoned' },
    abandonment: {
      sequence: nextSequence(run),
      at: command.at,
      from: run.position,
      actor: command.actor,
      reason: command.reason,
    },
  };
}
