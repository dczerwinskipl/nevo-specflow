import type { TaskIndex, TaskManifest } from '../../tasks/resource/model';
import {
  taskResourceIssueKey,
  validateTaskResources,
  type TaskResourceIssue,
} from '../../tasks/resource/validate';
import { foldPathKey } from '../../specs/document-rules/document-paths';
import { WorkflowError } from '../errors';
import { isValidTaskId, RECORD_BYTES_MAX, TASKS_PER_SPECIFICATION_MAX } from '../limits';
import { isTaskDocumentPath } from './journal';
import type {
  AttemptRecord,
  SpecificationExecutionRecord,
  TaskRunRecord,
  WorkflowRun,
} from './model';
import type { ExecutionChange, ExecutionSnapshot } from './store';

/**
 * Coherence of the execution state of one Specification, beyond the shape the codecs check. A store
 * runs it on every read and on the state a change would produce before it writes anything.
 *
 * Two levels:
 * - a record that contradicts itself (a run whose history and position disagree, a record of another
 *   Specification, more Tasks than allowed) is `WORKFLOW_STATE_CORRUPT`: it is neither interpreted
 *   nor stored;
 * - an inconsistency between the Task files (`validateTaskResources`: dangling, unregistered, broken,
 *   dependency, cycle) is returned as issues. A read reports them and affects only the Tasks they
 *   name (a Task removed or damaged by hand never breaks the rest); a change is refused when it would
 *   add one ({@link assertNoNewIssues}).
 *
 * Definitions are not consulted (the pin covers step ids); whether a position follows from its
 * history is checked against the pinned definition when a run is loaded (`assertPositionJustified`).
 */

export interface ExecutionState {
  readonly specification?: SpecificationExecutionRecord;
  readonly index?: TaskIndex;
  /** The manifests read for the registered Tasks. */
  readonly manifests: readonly TaskManifest[];
  readonly runs: readonly TaskRunRecord[];
  readonly folders: readonly string[];
}

export function stateOfSnapshot(snapshot: ExecutionSnapshot): ExecutionState {
  return {
    ...(snapshot.specification ? { specification: snapshot.specification.value } : {}),
    ...(snapshot.index ? { index: snapshot.index.value } : {}),
    manifests: snapshot.manifests.map((entry) => entry.value),
    runs: snapshot.runs.map((entry) => entry.value),
    folders: snapshot.folders,
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

/** Check the records and return the Task resource issues of the state. */
export function validateExecutionState(specId: string, state: ExecutionState): TaskResourceIssue[] {
  if (state.specification) {
    if (state.specification.specId !== specId) {
      corrupt('holds the run of another Specification');
    }

    validateRun(state.specification.run, 'the Specification');
  }

  if (
    state.runs.length > TASKS_PER_SPECIFICATION_MAX ||
    state.folders.length > TASKS_PER_SPECIFICATION_MAX
  ) {
    corrupt('holds more Tasks than a Specification may have');
  }

  const runIds = new Set<string>();
  for (const record of state.runs) {
    if (record.specId !== specId) {
      corrupt(`holds the Task run "${record.taskId}" of another Specification`);
    }

    if (runIds.has(record.taskId)) {
      corrupt(`holds the Task run "${record.taskId}" twice`);
    }

    runIds.add(record.taskId);
    validateRun(record.run, `the Task "${record.taskId}"`);
  }

  const registered = new Set(state.index?.tasks.map((entry) => entry.id) ?? []);

  return validateTaskResources({
    index: state.index?.tasks.map((entry) => entry.id) ?? [],
    manifests: new Map(
      state.manifests
        .filter((manifest) => registered.has(manifest.id))
        .map((manifest) => [manifest.id, manifest]),
    ),
    folders: state.folders,
    runs: state.runs.map((record) => ({
      taskId: record.taskId,
      state: record.run.position.state,
      attempts: record.run.attempts.length,
    })),
  });
}

/** A change may keep the issues the state already has, but must not add one. */
export function assertNoNewIssues(
  before: readonly TaskResourceIssue[],
  after: readonly TaskResourceIssue[],
): void {
  const known = new Set(before.map(taskResourceIssueKey));
  const added = after.find((issue) => !known.has(taskResourceIssueKey(issue)));
  if (added !== undefined) {
    throw new WorkflowError(
      'WORKFLOW_STATE_CORRUPT',
      `The change would leave the Task "${added.taskId}" inconsistent (${added.kind}${'reason' in added ? `: ${added.reason}` : ''}).`,
    );
  }
}

function invalidChange(message: string): never {
  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', message);
}

/**
 * The identity rules of a change, before anything is planned: every Task target names a valid Task
 * id once per kind, a written record holds the Task it is written for, and a document path is a
 * portable path below the Task folder other than its manifest.
 */
export function assertChangeIdentity(change: ExecutionChange): void {
  const unique = (kind: string, keys: readonly string[]) => {
    if (new Set(keys).size !== keys.length) {
      invalidChange(`A change writes a ${kind} twice.`);
    }
  };

  for (const write of [...(change.runs ?? []), ...(change.manifests ?? [])]) {
    if (!isValidTaskId(write.taskId)) {
      invalidChange('A change names an invalid Task id.');
    }
  }

  for (const write of change.runs ?? []) {
    if (write.next.taskId !== write.taskId) {
      invalidChange('A Task run write names another Task.');
    }
  }

  for (const write of change.manifests ?? []) {
    if (write.next !== null && write.next.id !== write.taskId) {
      invalidChange('A Task manifest write names another Task.');
    }
  }

  for (const write of change.documents ?? []) {
    if (!isValidTaskId(write.taskId) || !isTaskDocumentPath(write.path)) {
      invalidChange('A Task document write names an invalid Task or path.');
    }

    // A document the store creates is a first text (`initialTaskDocument`), bounded like a record.
    if (write.text !== null && Buffer.byteLength(write.text, 'utf8') > RECORD_BYTES_MAX) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        `A new Task document may hold at most ${String(RECORD_BYTES_MAX)} bytes.`,
      );
    }
  }

  unique(
    'Task run',
    (change.runs ?? []).map((write) => write.taskId),
  );
  unique(
    'Task manifest',
    (change.manifests ?? []).map((write) => write.taskId),
  );
  unique(
    'Task document',
    (change.documents ?? []).map((write) => `${write.taskId}/${foldPathKey(write.path)}`),
  );
}

/**
 * The state a change produces. A Task folder exists while it has its manifest or a document the
 * change creates; removing the manifest removes the folder (the store removes it once it is empty).
 */
export function nextExecutionState(
  current: ExecutionState,
  change: ExecutionChange,
): ExecutionState {
  const manifests = new Map(current.manifests.map((manifest) => [manifest.id, manifest]));
  const runs = new Map(current.runs.map((record) => [record.taskId, record]));
  const folders = new Set(current.folders);
  for (const write of change.manifests ?? []) {
    if (write.next === null) {
      manifests.delete(write.taskId);
      folders.delete(write.taskId);
    } else {
      manifests.set(write.taskId, write.next);
      folders.add(write.taskId);
    }
  }

  for (const write of change.documents ?? []) {
    if (write.text !== null) {
      folders.add(write.taskId);
    }
  }

  for (const write of change.runs ?? []) {
    runs.set(write.taskId, write.next);
  }

  const specification = change.specification?.next ?? current.specification;
  const index = change.index?.next ?? current.index;

  return {
    ...(specification ? { specification } : {}),
    ...(index ? { index } : {}),
    manifests: [...manifests.values()],
    runs: [...runs.values()],
    folders: [...folders].sort(),
  };
}
