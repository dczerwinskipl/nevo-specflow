import {
  activeAttempt,
  handoffOf,
  WorkflowError as CoreWorkflowError,
  type RunPosition,
  type TerminalOutcome,
} from '@nevo/workflow';

import { ProjectControlLockError } from '../../project/control-lock';
import { SpecificationError } from '../../specs/model';

import type { AttentionItem } from '../attention/model';
import {
  taskPosition,
  type ExecutionTask,
  type TaskStatus,
  type WorkflowActor,
  type WorkflowRun,
} from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import { isTaskClosed } from '../tasks/tasks';
import {
  presentHandoff,
  taskProjectionRead,
  unstartedTaskStanding,
  type ActionDependencies,
  type ActionProjection,
  type PresentedHandoff,
} from './actions';
import { deriveAttention } from './attention';
import { inspectSnapshot, type ExecutionInspection } from './inspect';
import { resolveSpecificationExecution } from '../definitions/catalogue';
import { pinnedDefinitionIfUnchanged } from './loaded-execution';
import type { StartBlocker } from './start-blockers';
import { forOneRead } from './task-references';

/**
 * The neutral facts of one readable Task, derived from its record and its action projection, never
 * stored. They describe authoritative state only: no group, label or order (a dashboard grouping is
 * a presentation of these facts, owned by the surface).
 */
export interface TaskFacts {
  /** The preparation status (`draft`, `ready`, `on-hold`, `cancelled`). */
  readonly preparation: TaskStatus;
  /** On hold by its own escalation (`statusChange.source: escalation`). */
  readonly escalated: boolean;
  /** Where its run stands (`not-started` without a run); a terminal position carries the outcome. */
  readonly position: RunPosition;
  /** Its next step can start now: the start-blocker rule of the action projection finds none. */
  readonly startable: boolean;
  /** Why its next step cannot start (the projection's blockers); empty when it can, or is active. */
  readonly startBlockers: readonly StartBlocker[];
  /** It waits for these direct dependencies (`unsatisfiable`: those that can never complete). */
  readonly dependencyWait?: {
    readonly waitingFor: readonly string[];
    readonly unsatisfiable: readonly string[];
  };
  /** The workflow its run is pinned to is missing or changed. */
  readonly definitionChanged: boolean;
  /** What a person has to do about it now, if anything (the projection's `attention`). */
  readonly attention?: AttentionItem;
}

/** The facts of a broken Task (`ExecutionInspection.brokenTasks`): what is readable of it. */
export interface BrokenTaskFacts {
  readonly taskId: string;
  /** Its manifest's title, when the manifest is readable. */
  readonly title?: string;
  readonly reason: Extract<StartBlocker, { kind: 'broken' }>['reason'];
}

/** Whether the Specification's Tasks are prepared: none yet, a draft still open, or all decided. */
export type TaskPreparation = 'empty' | 'preparing' | 'prepared';

/**
 * Progress over the Tasks meant to be done: `total` counts every Task that is neither cancelled
 * nor ended without completing (a broken Task counts, it is not done; a Task on hold counts, it is
 * unfinished), `completed` those whose run completed. `cancelled` (also those an abandon
 * cancelled), `ended` (abandoned by its own workflow, not cancelled) and `onHold` count those Tasks
 * apart, so a surface names them without guessing.
 */
export interface TaskProgress {
  readonly completed: number;
  readonly total: number;
  readonly cancelled: number;
  readonly ended: number;
  readonly onHold: number;
}

export interface ExecutionReading {
  /** Its `attention` is every attention item of the read (start blockers included). */
  readonly inspection: ExecutionInspection;
  /**
   * The action projection of each requested Task, from the same snapshot as `inspection`, without
   * its authoring facts (`taskAuthoring` is only in `inspectActions` of one Task).
   */
  readonly actions: ReadonlyMap<string, ActionProjection>;
  /** The neutral facts of each requested readable Task. */
  readonly facts: ReadonlyMap<string, TaskFacts>;
  /** Every broken Task, in id order. */
  readonly broken: readonly BrokenTaskFacts[];
  /** Over every Task of the inspection, whichever Tasks were projected. */
  readonly progress: TaskProgress;
  readonly preparation: TaskPreparation;
}

export interface ReadExecutionOptions {
  /**
   * The Tasks whose action projection (and facts) is read: `all`, some, or none (`[]`) when only
   * the inspection, progress and preparation are needed.
   */
  readonly tasks: 'all' | readonly string[];
}

/** {@link TaskFacts} of a Task the inspection lists, from its action projection. Pure. */
export function taskFactsOf(
  entry: ExecutionInspection['tasks'][number],
  projection: ActionProjection,
): TaskFacts {
  const { record } = entry;
  const position = projection.position;
  const startBlockers = position.kind === 'blocked' ? position.blockers : [];
  const dependencies = startBlockers.find(
    (blocker): blocker is Extract<StartBlocker, { kind: 'dependencies' }> =>
      blocker.kind === 'dependencies',
  );

  return {
    preparation: record.status,
    escalated: record.status === 'on-hold' && record.statusChange?.source === 'escalation',
    position: taskPosition(record),
    startable: position.kind === 'not-started' || position.kind === 'ready',
    startBlockers,
    ...(dependencies
      ? {
          dependencyWait: {
            waitingFor: dependencies.waitingFor,
            unsatisfiable: dependencies.unsatisfiable,
          },
        }
      : {}),
    definitionChanged: entry.definitionChanged === true,
    ...(projection.attention ? { attention: projection.attention } : {}),
  };
}

/**
 * One read of a Specification's execution for presentation: the inspection (with every attention
 * item), the action projection of the requested Tasks, and the facts, progress and preparation
 * derived from them, all from ONE snapshot read under `serialize`, so no part reflects another
 * moment. Read-only, like its parts.
 */
export function readExecution(
  outer: ActionDependencies,
  specId: string,
  options: ReadExecutionOptions,
): Promise<ExecutionReading> {
  return outer.serialize(async () => {
    // One read: every reference lookup is asked once (`readScopedReferences`).
    const dependencies = forOneRead(outer);
    const snapshot = await dependencies.store.read(specId);
    const listed = snapshot.manifests.map((entry) => entry.value.id);
    const wanted =
      options.tasks === 'all' ? listed : options.tasks.filter((taskId) => listed.includes(taskId));
    const { inspection, projections } = await inspectSnapshot(dependencies, snapshot, wanted);
    const actions = new Map<string, ActionProjection>();
    const facts = new Map<string, TaskFacts>();
    for (const entry of inspection.tasks) {
      const taskId = entry.record.taskId;
      const projection = projections.get(taskId);
      if (projection && wanted.includes(taskId)) {
        actions.set(taskId, projection);
        facts.set(taskId, taskFactsOf(entry, projection));
      }
    }

    return {
      inspection,
      actions,
      facts,
      broken: brokenFactsOf(snapshot, inspection),
      ...progressAndPreparation(
        inspection.tasks.map((entry) => entry.record),
        inspection.brokenTasks.length,
      ),
    };
  });
}

/**
 * Where a Specification's own run stands, for a list row: the same position the action projection
 * gives the Specification (`not-started`, at a step, `terminal`), without gates or actions.
 *
 * - `not-started`: no run yet; `steps` and `firstStep` name the workflow its archetype would start,
 *   when it resolves;
 * - `step`: the run is at a step: `active` (an attempt works on it: `attempt` is its number, start
 *   and who started it), `ready` (between attempts; `handoff` is what the last attempt or return
 *   handed over, as the Overview's Last hand-off reads it) or `waiting` (active on a wait step,
 *   which only Tasks end). `step` is absent when the pinned workflow is missing or changed (its
 *   title cannot be resolved);
 * - `ended`: the run ended with `outcome`; `steps` is its workflow's step count when it resolves,
 *   `abandonedAt` when an abandoned run was abandoned.
 */
export type SpecificationStanding =
  | { readonly kind: 'not-started'; readonly steps?: number; readonly firstStep?: string }
  | {
      readonly kind: 'step';
      readonly state: 'active' | 'ready' | 'waiting';
      readonly step?: { readonly title: string; readonly position: number; readonly count: number };
      readonly attempt?: {
        readonly number: number;
        readonly startedAt: string;
        readonly actor: WorkflowActor;
      };
      readonly handoff?: PresentedHandoff;
    }
  | {
      readonly kind: 'ended';
      readonly outcome: TerminalOutcome;
      readonly steps?: number;
      readonly abandonedAt?: string;
    };

/**
 * The Tasks as the Specification's Overview groups them (`DEFAULT_DASHBOARD_GROUPING`): `open`
 * Tasks keep a wait step waiting (neither terminal nor cancelled; a broken Task counts), of `total`
 * (as the waiting position counts them); `inProgress` are approved Tasks with a started run that
 * has not ended; `readyToStart` approved Tasks that have not started and can start now.
 */
export interface SpecificationListingTasks {
  readonly open: number;
  readonly total: number;
  readonly inProgress: number;
  readonly readyToStart: number;
}

/** One Specification row of the Specs list (`readSpecificationListing`). */
export interface SpecificationListing extends Pick<ExecutionReading, 'progress' | 'preparation'> {
  readonly standing: SpecificationStanding;
  readonly tasks: SpecificationListingTasks;
  /**
   * The attention items of the Specification's execution, the Overview's Requires attention: the
   * same items in the same order (`ExecutionInspection.attention`).
   */
  readonly attention: readonly AttentionItem[];
  /** The titles of the readable Tasks, by id (an attention item names its Tasks by them). */
  readonly taskTitles: ReadonlyMap<string, string>;
}

/**
 * Why a listed Specification's execution could not be read:
 *
 * - `invalid`: its files do not hold a valid state (a manifest or record that does not validate, a
 *   run that does not follow from its history, a change made outside the Engine while one was
 *   pending, a Specification that no longer resolves);
 * - `filesystem`: a file could not be read (permissions, a missing or locked file);
 * - `busy`: the project control lock stayed held by another writer longer than a read waits;
 * - `unexpected`: anything else, a defect: the caller logs it with the Specification.
 */
export type SpecificationListingFailure =
  'invalid' | 'filesystem' | 'busy' | 'recovery' | 'unexpected';

/** The list read of one Specification: its listing, or why it could not be read and the error. */
export type SpecificationListingRead =
  | { readonly kind: 'read'; readonly listing: SpecificationListing }
  | {
      readonly kind: 'unreadable';
      readonly reason: SpecificationListingFailure;
      readonly error: unknown;
    };

const INVALID_STATE_CODES: ReadonlySet<string> = new Set([
  'WORKFLOW_STATE_CORRUPT',
  'WORKFLOW_STATE_CONFLICT',
  'WORKFLOW_SUBJECT_NOT_FOUND',
  'WORKFLOW_DEFINITION_MISSING',
]);

/** Why a Specification's listing failed, from the error alone. Pure. */
export function listingFailureOf(error: unknown): SpecificationListingFailure {
  if (error instanceof SpecificationError) {
    return 'invalid';
  }

  if (error instanceof CoreWorkflowError) {
    return INVALID_STATE_CODES.has(String(error.code)) ? 'invalid' : 'unexpected';
  }

  if (error instanceof ProjectControlLockError) {
    return error.code === 'CONTROL_LOCK_BUSY'
      ? 'busy'
      : error.code === 'CONTROL_LOCK_RECOVERY_REQUIRED' || error.code === 'CONTROL_LOCK_CORRUPT'
        ? 'recovery'
        : 'unexpected';
  }

  const code = error instanceof Error ? (error as { readonly code?: unknown }).code : undefined;

  return typeof code === 'string' && /^E[A-Z]+$/.test(code) ? 'filesystem' : 'unexpected';
}

/**
 * What the Specs list shows of one Specification: the Specification's standing, its Task counts,
 * its attention items, progress and preparation, from ONE snapshot.
 *
 * Only the snapshot read holds `serialize` (the project control lock), so a write waits for one
 * Specification's files at most, never for the rest of the listing: what follows from the snapshot
 * (its attention, the lookups and the entry gate documents of the Tasks that have not started) is
 * decided after the lock is released, as the documents' own reads are (they take no lock).
 *
 * The same rules as the Overview's inspection (`inspectSnapshot`), without its cost: the attention
 * the canonical state decides is `deriveAttention` (no lookup), and each approved Task that has not
 * started gets only {@link unstartedTaskStanding} instead of a whole action projection, so the
 * Task's documents are read (its first step's entry gates) only for a Task nothing else keeps from
 * starting. It reads no Git. Read-only.
 */
export async function readSpecificationListing(
  outer: ActionDependencies,
  specId: string,
): Promise<SpecificationListing> {
  const snapshot = await outer.serialize(() => outer.store.read(specId));

  return listingOf(forOneRead(outer), snapshot);
}

/**
 * {@link readSpecificationListing} of several Specifications, one after the other: one short lock
 * section per Specification (its snapshot read), so writes interleave with a list read instead of
 * waiting for all of it. A Specification whose execution cannot be read says why (`unreadable`,
 * with the error); the others are unaffected.
 */
export async function readSpecificationListings(
  outer: ActionDependencies,
  specIds: readonly string[],
): Promise<ReadonlyMap<string, SpecificationListingRead>> {
  const listings = new Map<string, SpecificationListingRead>();
  // One bounded wait per list read: once the control lock stayed busy for one Specification, the
  // rest answer busy at once instead of each waiting the whole lock budget again.
  let busy: SpecificationListingRead | undefined;
  for (const specId of specIds) {
    if (busy) {
      listings.set(specId, busy);
      continue;
    }

    try {
      listings.set(specId, {
        kind: 'read',
        listing: await readSpecificationListing(outer, specId),
      });
    } catch (error) {
      const read = { kind: 'unreadable', reason: listingFailureOf(error), error } as const;
      listings.set(specId, read);
      busy = read.reason === 'busy' ? read : undefined;
    }
  }

  return listings;
}

async function listingOf(
  dependencies: ActionDependencies,
  snapshot: ExecutionSnapshot,
): Promise<SpecificationListing> {
  const read = taskProjectionRead(dependencies, snapshot);
  const { tasks, broken } = read.tasks;
  // The Overview's order: what the state decides, then the start blockers in Task order.
  const attention = [...deriveAttention(dependencies.catalogue, snapshot)];
  let inProgress = 0;
  let readyToStart = 0;
  for (const record of tasks) {
    if (record.status !== 'ready') {
      continue;
    }

    const position = taskPosition(record).state;
    if (position === 'active' || position === 'ready') {
      inProgress += 1;
    } else if (position === 'not-started') {
      const standing = await unstartedTaskStanding(dependencies, read, record);
      readyToStart += standing.startable ? 1 : 0;
      if (standing.attention) {
        attention.push(standing.attention);
      }
    }
  }

  return {
    standing: snapshot.specification
      ? standingOf(dependencies.catalogue, snapshot.specification.value.run)
      : await notStarted(dependencies, snapshot.specId),
    tasks: {
      open: tasks.filter((record) => !isTaskClosed(record)).length + broken.length,
      total: tasks.length + broken.length,
      inProgress,
      readyToStart,
    },
    attention,
    taskTitles: new Map(tasks.map((record) => [record.taskId, record.title] as const)),
    ...progressAndPreparation(tasks, broken.length),
  };
}

/** A Specification without a run: the workflow its archetype would start, when it resolves. */
async function notStarted(
  dependencies: ActionDependencies,
  specId: string,
): Promise<SpecificationStanding> {
  const resolved = resolveSpecificationExecution(
    dependencies.catalogue,
    await dependencies.references.archetype(specId),
  );
  if (resolved.kind === 'problem') {
    return { kind: 'not-started' };
  }

  const { workflow } = resolved;
  const first = workflow.steps.find((step) => step.id === workflow.entryStep);

  return {
    kind: 'not-started',
    steps: workflow.steps.length,
    ...(first ? { firstStep: first.title } : {}),
  };
}

function standingOf(
  catalogue: ActionDependencies['catalogue'],
  run: WorkflowRun,
): SpecificationStanding {
  const position = run.position;
  const definition = pinnedDefinitionIfUnchanged(catalogue, run);
  if (position.state === 'not-started') {
    return { kind: 'not-started' };
  }

  if (position.state === 'terminal') {
    return {
      kind: 'ended',
      outcome: position.outcome,
      ...(definition ? { steps: definition.steps.length } : {}),
      ...(position.outcome === 'abandoned' && run.abandonment
        ? { abandonedAt: run.abandonment.at }
        : {}),
    };
  }

  const index = definition?.steps.findIndex((step) => step.id === position.step) ?? -1;
  const step = index >= 0 ? definition?.steps[index] : undefined;
  const described =
    definition && step
      ? { step: { title: step.title, position: index + 1, count: definition.steps.length } }
      : {};
  if (position.state === 'ready') {
    const handoff = definition ? presentHandoff(definition, run, handoffOf(run)) : undefined;

    return { kind: 'step', state: 'ready', ...described, ...(handoff ? { handoff } : {}) };
  }

  if (step?.kind === 'wait') {
    return { kind: 'step', state: 'waiting', ...described };
  }

  const active = activeAttempt(run);

  return {
    kind: 'step',
    state: 'active',
    ...described,
    ...(active?.actor
      ? { attempt: { number: active.attempt, startedAt: active.startedAt, actor: active.actor } }
      : {}),
  };
}

/** What is readable of each broken Task: its manifest's title and why it is broken. */
function brokenFactsOf(
  snapshot: ExecutionSnapshot,
  inspection: ExecutionInspection,
): BrokenTaskFacts[] {
  return inspection.brokenTasks.map((taskId) => {
    const issue = inspection.issues.find(
      (candidate) =>
        (candidate.kind === 'broken' || candidate.kind === 'dangling') &&
        candidate.taskId === taskId,
    );
    const title = snapshot.manifests.find((entry) => entry.value.id === taskId)?.value.title;

    return {
      taskId,
      ...(title !== undefined ? { title } : {}),
      // A Task with consistent files whose position its history does not justify.
      reason:
        issue && (issue.kind === 'broken' || issue.kind === 'dangling') ? issue.reason : 'position',
    };
  });
}

/** {@link TaskProgress} and {@link TaskPreparation} of the readable Tasks and the broken count. */
function progressAndPreparation(
  tasks: readonly ExecutionTask[],
  brokenCount: number,
): Pick<ExecutionReading, 'progress' | 'preparation'> {
  let completed = 0;
  let cancelled = 0;
  let ended = 0;
  let onHold = 0;
  let total = brokenCount;
  for (const record of tasks) {
    const outcome =
      record.run?.position.state === 'terminal' ? record.run.position.outcome : undefined;
    if (record.status === 'cancelled') {
      cancelled += 1;
      continue;
    }

    if (outcome === 'abandoned') {
      ended += 1;
      continue;
    }

    total += 1;
    completed += outcome === 'completed' ? 1 : 0;
    onHold += record.status === 'on-hold' ? 1 : 0;
  }

  return {
    progress: { completed, total, cancelled, ended, onHold },
    preparation:
      tasks.length + brokenCount === 0
        ? 'empty'
        : tasks.some((record) => record.status === 'draft')
          ? 'preparing'
          : 'prepared',
  };
}
