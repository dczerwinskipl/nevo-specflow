import { WorkflowError } from '../errors';
import {
  taskPosition,
  type ExecutionTask,
  type SpecificationExecutionRecord,
} from '../state/model';

/**
 * What the workflow state of one Specification says about ending it (D07), pure. Close archives a
 * Specification only once nothing of its work is unfinished; Abandon (the owner's "close without
 * realization") ends the unfinished work first, but never while a write is still pending. Git and
 * workspace rules are Close's own (`specs/lifecycle`) and are not judged here.
 */

/** The workflow state of one Specification, as `readSpecificationExitState` reads it. */
export interface SpecificationExitState {
  readonly specId: string;
  /** The Specification run record; absent before its first start. */
  readonly specification?: SpecificationExecutionRecord;
  /** Whether the archetype binds a workflow, so an abandon can record the Specification's end. */
  readonly bound: boolean;
  /** The registered Tasks that are not broken, in id order. */
  readonly tasks: readonly ExecutionTask[];
  /** Broken or dangling Tasks (`executionTasks`), in id order. */
  readonly brokenTasks: readonly string[];
  /** A change of the execution store did not finish publishing. */
  readonly pendingExecutionChange: boolean;
  /** Tasks with a pending change of one of their documents, in id order. */
  readonly pendingTaskDocuments: readonly string[];
  /** Another durable operation (or an external execution) holds the Specification. */
  readonly operationInProgress: boolean;
}

export const CLOSE_BLOCKER_KINDS = [
  /** The Specification run has not ended. */
  'specification-run',
  'draft-tasks',
  'on-hold-tasks',
  /** Ready Tasks that never started, or whose run has not ended. */
  'unfinished-tasks',
  'broken-tasks',
  'pending-execution-change',
  'pending-task-documents',
  'operation-in-progress',
  /** The execution records could not be read (reported by the Close guard, not by this module). */
  'execution-state-unreadable',
] as const;
export type CloseBlockerKind = (typeof CLOSE_BLOCKER_KINDS)[number];

/**
 * One group of things that keep a Specification from ending, for a list with links: the subjects are
 * Task ids, or the Specification id for the Specification run and the Specification-wide holds.
 */
export interface CloseBlocker {
  readonly kind: CloseBlockerKind;
  readonly subjectIds: readonly string[];
  readonly message: string;
}

const isEnded = (task: ExecutionTask) => taskPosition(task).state === 'terminal';

/** A Task that still counts as work to do: not cancelled and its run (if any) has not ended. */
const isOpen = (task: ExecutionTask) => task.status !== 'cancelled' && !isEnded(task);

function group(
  kind: CloseBlockerKind,
  subjectIds: readonly string[],
  message: string,
): CloseBlocker[] {
  return subjectIds.length > 0 ? [{ kind, subjectIds, message }] : [];
}

/** Pending writes and broken records: they refuse Close and Abandon alike. */
function holdBlockers(state: SpecificationExitState): CloseBlocker[] {
  return [
    ...group(
      'broken-tasks',
      state.brokenTasks,
      'These Tasks are broken or dangling; restore them from Git or remove them.',
    ),
    ...group(
      'pending-execution-change',
      state.pendingExecutionChange ? [state.specId] : [],
      'A workflow change did not finish; retry the last workflow action.',
    ),
    ...group(
      'pending-task-documents',
      state.pendingTaskDocuments,
      'A change of a document of these Tasks is not committed yet; wait for it or retry it.',
    ),
  ];
}

/**
 * What keeps Close from archiving the Specification, grouped; none when the workflow allows it. A
 * Specification that never started and has no Tasks closes as before, bound to a workflow or not. A
 * Task never started has no run record: it blocks unless cancelled.
 */
export function closeBlockers(state: SpecificationExitState): CloseBlocker[] {
  const open = state.tasks.filter(isOpen);
  const ids = (status: ExecutionTask['status']) =>
    open.filter((task) => task.status === status).map((task) => task.taskId);
  const run = state.specification?.run;

  return [
    ...group(
      'specification-run',
      run && run.position.state !== 'terminal' ? [state.specId] : [],
      'The Specification workflow has not ended; finish it, or abandon the Specification.',
    ),
    ...group('draft-tasks', ids('draft'), 'Approve or cancel these draft Tasks.'),
    ...group('on-hold-tasks', ids('on-hold'), 'Resume or cancel these Tasks on hold.'),
    ...group('unfinished-tasks', ids('ready'), 'Finish or cancel these Tasks.'),
    ...holdBlockers(state),
  ];
}

/**
 * What keeps Abandon from ending the Specification's work: pending writes, broken Tasks and other
 * operations on it. Unfinished work does not: abandoning ends it.
 */
export function abandonBlockers(state: SpecificationExitState): CloseBlocker[] {
  return [
    ...holdBlockers(state),
    ...group(
      'operation-in-progress',
      state.operationInProgress ? [state.specId] : [],
      'Another operation on this Specification or project is in progress; retry once it settles.',
    ),
  ];
}

export type CloseAvailability =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'blocked'; readonly blockers: readonly CloseBlocker[] };

export type AbandonAvailability =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'blocked'; readonly blockers: readonly CloseBlocker[] }
  /**
   * - `ended`: the Specification workflow completed or was abandoned (Abandon is final);
   * - `not-configured`: no workflow is bound and none ran, so there is nothing to abandon.
   */
  | { readonly kind: 'unavailable'; readonly reason: 'ended' | 'not-configured' };

export interface SpecificationLifecycleActions {
  /** As far as the workflow is concerned; Close still checks Git and the workspace itself. */
  readonly close: CloseAvailability;
  readonly abandon: AbandonAvailability;
}

/** Whether Close and Abandon are available for the Specification, for an action projection. */
export function specificationLifecycleActions(
  state: SpecificationExitState,
): SpecificationLifecycleActions {
  const close = closeBlockers(state);

  return {
    close: close.length > 0 ? { kind: 'blocked', blockers: close } : { kind: 'allowed' },
    abandon: abandonAvailability(state),
  };
}

function abandonAvailability(state: SpecificationExitState): AbandonAvailability {
  const run = state.specification?.run;
  if (run?.position.state === 'terminal') {
    return { kind: 'unavailable', reason: 'ended' };
  }

  if (!run && !state.bound) {
    return { kind: 'unavailable', reason: 'not-configured' };
  }

  const blockers = abandonBlockers(state);

  return blockers.length > 0 ? { kind: 'blocked', blockers } : { kind: 'allowed' };
}

/** A refusal to end a Specification, with what holds it (`WORKFLOW_EXIT_BLOCKED`). */
export class SpecificationExitBlockedError extends WorkflowError {
  readonly blockers: readonly CloseBlocker[];

  constructor(blockers: readonly CloseBlocker[]) {
    super(
      'WORKFLOW_EXIT_BLOCKED',
      `The Specification cannot end now: ${blockers.map((blocker) => blocker.kind).join(', ')}.`,
    );
    this.blockers = blockers;
  }
}
