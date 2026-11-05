import { sha256Hex } from '../../hash';
import { canonicalJson } from '../../specs/definitions/resolved-catalogue';
import {
  findStep,
  type WorkflowDefinition,
  type WorkflowReturn,
  type WorkflowStep,
  type WorkflowTransition,
} from '../definitions/model';
import { WorkflowError } from '../errors';
import { ARTIFACTS_MAX, ARTIFACT_MAX, FEEDBACK_MAX } from '../limits';
import {
  activeAttempt,
  nextAttemptNumber,
  nextSequence,
  type AttemptRecord,
  type ExecutorRecord,
  type ReturnRecord,
  type RunPosition,
  type WorkflowPin,
  type WorkflowRun,
} from '../state/model';

/**
 * The deterministic state machine of one workflow run. Pure: every function takes the stored run and
 * the pinned definition and either returns the next run or throws a {@link WorkflowError}.
 *
 * Start activates, finish completes and never starts the next step, and a return moves the run back
 * to a declared step from any non-terminal position.
 */

export function workflowRevision(definition: WorkflowDefinition): string {
  return sha256Hex(canonicalJson(definition));
}

export function pinOf(definition: WorkflowDefinition): WorkflowPin {
  return { id: definition.id, version: definition.version, revision: workflowRevision(definition) };
}

export function newRun(definition: WorkflowDefinition): WorkflowRun {
  return {
    workflow: pinOf(definition),
    position: { state: 'not-started' },
    attempts: [],
    returns: [],
  };
}

/** A run is only ever interpreted with the exact definition it was pinned to. */
export function assertPinned(run: WorkflowRun, definition: WorkflowDefinition): void {
  const pin = pinOf(definition);
  if (run.workflow.id !== pin.id || run.workflow.revision !== pin.revision) {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_CHANGED',
      `The run is pinned to workflow "${run.workflow.id}" version ${run.workflow.version}, which is no longer the loaded definition.`,
    );
  }
}

function stepOf(definition: WorkflowDefinition, id: string): WorkflowStep {
  const step = findStep(definition, id);
  if (!step) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The run refers to an unknown step "${id}".`);
  }

  return step;
}

export type StartPlan =
  /** The step is already active; starting again is idempotent. */
  | { readonly kind: 'resume'; readonly step: WorkflowStep; readonly attempt: number }
  | { readonly kind: 'activate'; readonly step: WorkflowStep; readonly attempt: number }
  /** Nothing to start: the run already ended. */
  | { readonly kind: 'terminal' };

export function planStart(run: WorkflowRun, definition: WorkflowDefinition): StartPlan {
  const position = run.position;
  switch (position.state) {
    case 'terminal':
      return { kind: 'terminal' };
    case 'active':
      return { kind: 'resume', step: stepOf(definition, position.step), attempt: position.attempt };
    case 'not-started':
      return {
        kind: 'activate',
        step: stepOf(definition, definition.entryStep),
        attempt: nextAttemptNumber(run, definition.entryStep),
      };
    case 'ready':
      return {
        kind: 'activate',
        step: stepOf(definition, position.step),
        attempt: nextAttemptNumber(run, position.step),
      };
  }
}

export function applyStart(
  run: WorkflowRun,
  plan: StartPlan,
  context: { readonly at: string; readonly executor?: ExecutorRecord },
): WorkflowRun {
  if (plan.kind !== 'activate') {
    return run;
  }

  return {
    ...run,
    position: { state: 'active', step: plan.step.id, attempt: plan.attempt },
    attempts: [
      ...run.attempts,
      {
        step: plan.step.id,
        attempt: plan.attempt,
        sequence: nextSequence(run),
        startedAt: context.at,
        ...(context.executor ? { executor: context.executor } : {}),
      },
    ],
  };
}

export interface FinishInput {
  readonly result?: string;
  readonly feedback?: string;
  readonly artifacts?: readonly string[];
}

export interface FinishPlan {
  readonly step: WorkflowStep;
  readonly attempt: number;
  readonly transition: WorkflowTransition;
  readonly next: RunPosition;
}

function selectTransition(step: WorkflowStep, result: string | undefined): WorkflowTransition {
  const [only] = step.transitions;
  if (only && only.result === undefined) {
    if (result !== undefined) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        `The step "${step.id}" takes no result, but "${result}" was given.`,
      );
    }

    return only;
  }

  const selected = step.transitions.find((transition) => transition.result === result);
  if (!selected) {
    const allowed = step.transitions.map((transition) => transition.result).join(', ');

    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The step "${step.id}" needs one of the results ${allowed}; got ${result ?? 'none'}.`,
    );
  }

  return selected;
}

function invalidInput(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

/** Feedback is stored trimmed; it must fit the stored limit. */
export function assertFeedback(feedback: string | undefined): void {
  if (feedback !== undefined && feedback.trim().length > FEEDBACK_MAX) {
    invalidInput(`The feedback is longer than ${FEEDBACK_MAX} characters.`);
  }
}

/** The finish input must fit the stored attempt record, so it is checked before anything changes. */
export function assertFinishInput(input: FinishInput): void {
  assertFeedback(input.feedback);
  const artifacts = input.artifacts ?? [];
  if (artifacts.length > ARTIFACTS_MAX) {
    invalidInput(`At most ${ARTIFACTS_MAX} artifacts can be named.`);
  }

  for (const artifact of artifacts) {
    if (!artifact.trim() || artifact.length > ARTIFACT_MAX) {
      invalidInput(`An artifact must be a non-empty text of at most ${ARTIFACT_MAX} characters.`);
    }
  }
}

/** Finish needs the exact active attempt; a stale caller never completes a newer attempt. */
export function planFinish(
  run: WorkflowRun,
  definition: WorkflowDefinition,
  attempt: { readonly step: string; readonly attempt: number },
  input: FinishInput,
): FinishPlan {
  const position = run.position;
  if (position.state !== 'active') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'No step is active.');
  }

  if (position.step !== attempt.step || position.attempt !== attempt.attempt) {
    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      `The active attempt is ${position.step}#${position.attempt}, not ${attempt.step}#${attempt.attempt}.`,
    );
  }

  assertFinishInput(input);
  const step = stepOf(definition, position.step);
  const transition = selectTransition(step, input.result);
  if (transition.feedback === 'required' && !input.feedback?.trim()) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The transition "${transition.id}" requires feedback.`,
    );
  }

  return {
    step,
    attempt: position.attempt,
    transition,
    next:
      transition.target.kind === 'step'
        ? { state: 'ready', step: transition.target.step }
        : { state: 'terminal', outcome: transition.target.outcome },
  };
}

export function applyFinish(
  run: WorkflowRun,
  plan: FinishPlan,
  input: FinishInput,
  at: string,
  finishedBy?: ExecutorRecord,
): WorkflowRun {
  const current = activeAttempt(run);
  if (!current) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The active attempt has no history record.');
  }

  const feedback = input.feedback?.trim();

  return {
    ...run,
    position: plan.next,
    attempts: run.attempts.map((record) =>
      record === current
        ? {
            ...record,
            endedAt: at,
            ...(finishedBy ? { finishedBy } : {}),
            outcome: {
              kind: 'transition',
              transition: plan.transition.id,
              ...(input.result !== undefined ? { result: input.result } : {}),
              ...(feedback ? { feedback } : {}),
              artifacts: [...(input.artifacts ?? [])],
            },
          }
        : record,
    ),
  };
}

export function planReturn(
  run: WorkflowRun,
  definition: WorkflowDefinition,
  to: string,
  feedback: string | undefined,
): WorkflowReturn {
  if (run.position.state === 'terminal') {
    throw new WorkflowError('WORKFLOW_RETURN_NOT_ALLOWED', 'A finished run cannot return.');
  }

  const entry = definition.returns.find((candidate) => candidate.step === to);
  if (!entry) {
    throw new WorkflowError(
      'WORKFLOW_RETURN_NOT_ALLOWED',
      `The workflow "${definition.id}" declares no return to "${to}".`,
    );
  }

  if (entry.feedback === 'required' && !feedback?.trim()) {
    throw new WorkflowError('WORKFLOW_INPUT_INVALID', `A return to "${to}" requires feedback.`);
  }

  assertFeedback(feedback);

  return entry;
}

/** An active attempt ends as `returned`; otherwise the return is recorded on its own. */
export function applyReturn(
  run: WorkflowRun,
  entry: WorkflowReturn,
  feedback: string | undefined,
  at: string,
): WorkflowRun {
  const text = feedback?.trim();
  const current = activeAttempt(run);
  const position: RunPosition = { state: 'ready', step: entry.step };
  if (current) {
    return {
      ...run,
      position,
      attempts: run.attempts.map((record) =>
        record === current
          ? {
              ...record,
              endedAt: at,
              outcome: { kind: 'returned', to: entry.step, ...(text ? { feedback: text } : {}) },
            }
          : record,
      ),
    };
  }

  return {
    ...run,
    position,
    returns: [
      ...run.returns,
      {
        sequence: nextSequence(run),
        at,
        from: run.position,
        to: entry.step,
        ...(text ? { feedback: text } : {}),
      },
    ],
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
  const lastAttempt = run.attempts
    .filter((record) => record.outcome !== undefined)
    .reduce<AttemptRecord | undefined>(
      (last, record) => (last && last.sequence > record.sequence ? last : record),
      undefined,
    );
  const lastReturn = run.returns.reduce<ReturnRecord | undefined>(
    (last, record) => (last && last.sequence > record.sequence ? last : record),
    undefined,
  );
  if (lastReturn && (!lastAttempt || lastReturn.sequence > lastAttempt.sequence)) {
    return {
      kind: 'return',
      at: lastReturn.at,
      ...(lastReturn.feedback ? { feedback: lastReturn.feedback } : {}),
    };
  }

  const outcome = lastAttempt?.outcome;
  if (!lastAttempt || !outcome) {
    return undefined;
  }

  if (outcome.kind === 'returned') {
    return {
      kind: 'return',
      at: lastAttempt.endedAt ?? lastAttempt.startedAt,
      ...(outcome.feedback ? { feedback: outcome.feedback } : {}),
    };
  }

  return {
    kind: 'transition',
    from: { step: lastAttempt.step, attempt: lastAttempt.attempt },
    transition: outcome.transition,
    ...(outcome.result !== undefined ? { result: outcome.result } : {}),
    ...(outcome.feedback !== undefined ? { feedback: outcome.feedback } : {}),
    artifacts: outcome.artifacts,
  };
}
