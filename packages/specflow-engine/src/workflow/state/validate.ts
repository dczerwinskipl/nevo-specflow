import type { AttentionItem } from '../attention/model';
import { WorkflowError } from '../errors';
import { TASKS_PER_SPECIFICATION_MAX } from '../limits';
import {
  subjectKey,
  type AttemptRecord,
  type SpecificationExecutionRecord,
  type TaskRecord,
  type WorkflowRun,
} from './model';
import type { ExecutionSnapshot } from './store';

/**
 * Coherence of the execution state of one Specification, beyond the shape the codec checks: the
 * invariants the operations rely on and never produce otherwise. A store runs it on every read and
 * on the state a change would produce before it writes anything, so an incoherent state is neither
 * interpreted nor stored. Definitions are not consulted (the pin covers step ids).
 */

export interface ExecutionState {
  readonly specification?: SpecificationExecutionRecord;
  readonly tasks: readonly TaskRecord[];
  readonly attention: readonly AttentionItem[];
}

export function stateOfSnapshot(snapshot: ExecutionSnapshot): ExecutionState {
  return {
    ...(snapshot.specification ? { specification: snapshot.specification.value } : {}),
    tasks: snapshot.tasks.map((entry) => entry.value),
    attention: snapshot.attention,
  };
}

function corrupt(message: string): never {
  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The stored execution state ${message}.`);
}

const isOpen = (record: AttemptRecord) =>
  record.endedAt === undefined && record.outcome === undefined;

function strictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? value));
}

function validateRun(run: WorkflowRun, owner: string): void {
  const open: AttemptRecord[] = [];
  const numbers = new Map<string, number[]>();
  for (const record of run.attempts) {
    if (isOpen(record)) {
      open.push(record);
    } else if (record.endedAt === undefined || record.outcome === undefined) {
      corrupt(`has an ended attempt of ${owner} without its end or outcome`);
    }

    numbers.set(record.step, [...(numbers.get(record.step) ?? []), record.attempt]);
  }

  const position = run.position;
  if (position.state === 'active') {
    const matching = run.attempts.filter(
      (record) => record.step === position.step && record.attempt === position.attempt,
    );
    if (matching.length !== 1 || open.length !== 1 || open[0] !== matching[0]) {
      corrupt(`has no single open attempt for the active step of ${owner}`);
    }
  } else if (open.length > 0) {
    corrupt(`has an open attempt of ${owner} while no step is active`);
  }

  for (const attempts of numbers.values()) {
    const sorted = [...attempts].sort((left, right) => left - right);
    if (sorted.some((attempt, index) => attempt !== index + 1)) {
      corrupt(`numbers the attempts of a step of ${owner} with a gap or twice`);
    }
  }

  const attemptSequences = run.attempts.map((record) => record.sequence);
  const returnSequences = run.returns.map((record) => record.sequence);
  if (
    !strictlyIncreasing(attemptSequences) ||
    !strictlyIncreasing(returnSequences) ||
    new Set([...attemptSequences, ...returnSequences]).size !==
      attemptSequences.length + returnSequences.length
  ) {
    corrupt(`orders the history of ${owner} inconsistently`);
  }
}

export function validateExecutionSnapshot(specId: string, state: ExecutionState): void {
  if (state.specification) {
    if (state.specification.specId !== specId) {
      corrupt('holds the run of another Specification');
    }

    validateRun(state.specification.run, 'the Specification');
  }

  if (state.tasks.length > TASKS_PER_SPECIFICATION_MAX) {
    corrupt('holds more Tasks than a Specification may have');
  }

  const taskIds = new Set<string>();
  for (const task of state.tasks) {
    if (task.specId !== specId) {
      corrupt(`holds the Task "${task.taskId}" of another Specification`);
    }

    if (taskIds.has(task.taskId)) {
      corrupt(`holds the Task "${task.taskId}" twice`);
    }

    taskIds.add(task.taskId);
    validateRun(task.run, `the Task "${task.taskId}"`);
    // A draft is revised by replacing it, which is only sound while it never ran.
    if (
      task.status === 'draft' &&
      (task.run.position.state !== 'not-started' || task.run.attempts.length > 0)
    ) {
      corrupt(`holds the draft Task "${task.taskId}" with a run`);
    }

    if (task.status === 'cancelled' && task.run.position.state === 'active') {
      corrupt(`holds the cancelled Task "${task.taskId}" with an active step`);
    }
  }

  const subjects = new Set<string>();
  for (const item of state.attention) {
    const key = subjectKey(item.subject);
    if (subjects.has(key)) {
      corrupt(`holds two attention items for ${key}`);
    }

    subjects.add(key);
    if ((item.reason === 'task-escalated') !== (item.taskIds !== undefined)) {
      corrupt(`holds a ${item.reason} item for ${key} with the wrong escalated Tasks`);
    }

    const exists =
      item.subject.specId === specId &&
      (item.subject.kind === 'specification'
        ? state.specification !== undefined
        : taskIds.has(item.subject.taskId));
    if (!exists) {
      corrupt(`holds attention for ${key}, which has no record`);
    }
  }
}
