import {
  listingFailureOf,
  readSpecificationListingsForRead,
  type AttentionItem,
  type SpecificationListing,
  type SpecificationListingFailure,
} from '@nevo/specflow-engine';
import type { CurrentSpecWorkflow } from '@nevo/specflow-contracts/specs/overview';
import type { TaskOverview } from '@nevo/specflow-contracts/tasks';
import type {
  WorkspaceAttention,
  WorkspaceTaskGroup,
} from '@nevo/specflow-contracts/specs/workspace';

import {
  inspectSpecification,
  TaskSourceUnavailableError,
  type TaskEngine,
} from '../engine/sources';
import type { InspectionBasis } from '../engine/projection';
import {
  isReadable,
  itemTaskIds,
  namedTaskIds,
  namedTaskTitles,
  taskBoardOf,
} from '../presentation/board';
import {
  DEFAULT_DASHBOARD_GROUPING,
  type DashboardGrouping,
} from '../presentation/default-grouping';
import { overviewSummary } from '../presentation/group-tasks';

/** The shape of the Specification workspace `tasks` section (the Specs feature consumes it). */
export type WorkspaceTasksSection =
  | {
      readonly state: 'available';
      readonly data: {
        readonly groups: WorkspaceTaskGroup[];
        readonly completed: number;
        readonly total: number;
        readonly cancelled: number;
        readonly ended: number;
        readonly onHold: number;
        readonly attention: WorkspaceAttention[];
        readonly overview: TaskOverview;
      };
    }
  | {
      readonly state: 'unavailable';
      readonly reason: 'not_implemented' | 'source_unavailable' | 'source_busy' | 'source_recovery';
    };

/** The `tasks` contribution: the section and the preparation state the Tasks imply. */
export interface WorkspaceTasksContribution {
  readonly section: WorkspaceTasksSection;
  /** Absent: the Tasks could not be read, so the Specification source's value stands. */
  readonly preparationState?: 'empty' | 'preparing' | 'prepared';
}

/**
 * One item of the Engine's attention projection as a workspace attention record: its message is
 * the display reason, its code, actor, action and Tasks are passed on for clients with their own
 * copy. A broken Task comes first (`critical`, above a Session waiting for input), as the
 * projection orders it.
 */
export function workspaceAttentionOf(
  item: AttentionItem,
  titles: ReadonlyMap<string, string>,
): WorkspaceAttention {
  const common = {
    reason: item.message,
    code: item.reason,
    ...(item.stepTitle ? { stepTitle: item.stepTitle } : {}),
    actor: item.actor,
    action: item.action,
    ...(item.secondaryAction ? { secondaryAction: item.secondaryAction } : {}),
    ...(item.taskIds ? { taskIds: [...item.taskIds] } : {}),
    ...(item.brokenTaskIds ? { brokenTaskIds: [...item.brokenTaskIds] } : {}),
    ...(item.blocking ? { blocking: item.blocking.map((task) => ({ ...task })) } : {}),
    ...(item.blocks
      ? {
          blocks:
            'taskIds' in item.blocks
              ? { ...item.blocks, taskIds: [...item.blocks.taskIds] }
              : { finish: item.blocks.finish },
        }
      : {}),
  };
  if (item.subject.kind === 'task') {
    const { taskId } = item.subject;

    return {
      id: `${item.reason === 'task-broken' ? 'task-broken' : 'task-attention'}.${taskId}`,
      kind: 'task',
      // A broken Task may have no readable title; its id stands in.
      title: titles.get(taskId) ?? taskId,
      targetId: taskId,
      priority: item.reason === 'task-broken' ? 'critical' : 'normal',
      ...common,
    };
  }

  return {
    id: 'specification-attention',
    kind: 'specification',
    title: item.stepTitle ?? item.step ?? 'Specification',
    priority: 'normal',
    ...common,
  };
}

/**
 * The workspace `tasks` section (the Overview's Tasks) of one Engine reading (`tasks: 'all'`): the
 * configured grouping with a per-row attention mark, the progress with cancelled and on hold apart,
 * the attention projection, and the Overview summary (its Tasks as the Tasks page rows) with
 * Now's explanation when the Specification is stuck. Pure.
 */
export function workspaceTasksOf(
  basis: Pick<InspectionBasis, 'reading' | 'catalogue'>,
  grouping: DashboardGrouping = DEFAULT_DASHBOARD_GROUPING,
): WorkspaceTasksContribution {
  const board = taskBoardOf(basis, grouping);
  const titles = new Map(
    board.rows.flatMap((row) => (row.title !== undefined ? [[row.id, row.title] as const] : [])),
  );
  const named = namedTaskIds(board.attention);
  const groups: WorkspaceTaskGroup[] = board.groups.map((group) => ({
    id: group.id,
    name: group.name,
    summary: group.summary,
    collapsed: group.collapsed,
    tasks: group.tasks.map((row) => ({
      id: row.id,
      // A broken Task without a readable title shows its id.
      title: row.title ?? row.id,
      status: row.status,
      ...(isReadable(row) ? { type: row.type, dependsOn: row.dependsOn } : {}),
      ...(named.has(row.id) ? { attention: true } : {}),
    })),
  }));
  const stuck = board.stuck?.map((task) => {
    const title = titles.get(task.taskId);

    return { ...task, ...(title !== undefined ? { title } : {}) };
  });

  return {
    section: {
      state: 'available',
      data: {
        groups,
        ...board.progress,
        attention: board.attention.map((item) => workspaceAttentionOf(item, titles)),
        overview: overviewOf(board, stuck),
      },
    },
    preparationState: basis.reading.preparation,
  };
}

/** The Overview summary with the titles of the Tasks its rows' and the attention's facts name. */
function overviewOf(
  board: ReturnType<typeof taskBoardOf>,
  stuck: TaskOverview['stuck'],
): TaskOverview {
  const summary = overviewSummary(board.groups);

  return {
    ...summary,
    ...(stuck ? { stuck } : {}),
    ...namedTaskTitles(
      board.rows,
      summary.rows.flatMap((row) => row.tasks),
      board.attention,
    ),
  };
}

const unavailable: WorkspaceTasksContribution = {
  section: { state: 'unavailable', reason: 'source_unavailable' },
};

/** Another writer holds the project control lock longer than the read waits: a retry soon can succeed. */
const busy: WorkspaceTasksContribution = {
  section: { state: 'unavailable', reason: 'source_busy' },
};

/** The lock is held by a process nothing proves stopped (or is corrupt): only recovery helps. */
const recovery: WorkspaceTasksContribution = {
  section: { state: 'unavailable', reason: 'source_recovery' },
};

/**
 * The `tasks` contribution (a project Runtime's Engine, or the demo's in memory): one Engine
 * reading of every Task. An execution the Engine cannot read now degrades only this section:
 * `source_busy` while another writer holds the control lock, else `source_unavailable`.
 */
export function createEngineWorkspaceTasks(
  source: TaskEngine,
): (specId: string) => Promise<WorkspaceTasksContribution> {
  return async (specId) => {
    try {
      const basis = await inspectSpecification(source, specId, 'all');

      return basis ? workspaceTasksOf(basis) : unavailable;
    } catch (error) {
      if (error instanceof TaskSourceUnavailableError) {
        return error.retryable ? busy : error.recovery ? recovery : unavailable;
      }

      throw error;
    }
  };
}

/**
 * The Specs list facts of one Specification's execution (`OverviewExecutionRecord` of the Specs
 * feature): its Task progress, where its workflow run stands, how many attention items it has and
 * the first of them as the Overview's Requires attention lists it (the same record, with the titles
 * of the Tasks it names).
 */
export interface OverviewExecutionFacts {
  readonly progress: { readonly completed: number; readonly total: number };
  readonly workflow: CurrentSpecWorkflow;
  readonly attention: number;
  readonly firstAttention?: {
    readonly first: WorkspaceAttention;
    readonly taskTitles?: Record<string, string>;
  };
}

/** The list facts of one Specification, or why its execution could not be read. */
export type OverviewExecutionRead =
  | ({ readonly kind: 'read' } & OverviewExecutionFacts)
  | { readonly kind: 'unreadable'; readonly reason: SpecificationListingFailure };

export type OverviewExecutionSource = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, OverviewExecutionRead>>;

type CurrentStepHandoff = NonNullable<Extract<CurrentSpecWorkflow, { kind: 'step' }>['handoff']>;

/** Where the Specification's run stands, as the Specs list contract carries it. Pure. */
export function overviewWorkflowOf(listing: SpecificationListing): CurrentSpecWorkflow {
  const { standing } = listing;
  if (standing.kind === 'not-started') {
    return {
      kind: 'not-started',
      ...(standing.steps ? { stepCount: standing.steps } : {}),
      ...(standing.firstStep !== undefined ? { firstStep: standing.firstStep } : {}),
    };
  }

  if (standing.kind === 'ended') {
    return {
      kind: 'ended',
      outcome: standing.outcome,
      ...(standing.steps ? { stepCount: standing.steps } : {}),
      ...(standing.abandonedAt !== undefined ? { abandonedAt: standing.abandonedAt } : {}),
    };
  }

  // The list names the hand-off, not what it said: the feedback is the Overview's.
  const given = standing.handoff;
  const handoff: CurrentStepHandoff | undefined =
    given?.kind === 'transition'
      ? (({ feedback: _feedback, ...rest }) => ({
          ...rest,
          from: { ...rest.from },
          artifacts: [...rest.artifacts],
        }))(given)
      : given
        ? { kind: 'return', at: given.at }
        : undefined;

  return {
    kind: 'step',
    state: standing.state,
    ...(standing.step ? { step: { ...standing.step } } : {}),
    ...(standing.attempt ? { attempt: structuredClone(standing.attempt) } : {}),
    ...(handoff ? { handoff } : {}),
    ...(standing.state === 'waiting' ? { tasks: { ...listing.tasks } } : {}),
  };
}

/**
 * The list facts of one listing: its first attention item as the Overview's record
 * (`workspaceAttentionOf`), with the titles of the Tasks it names. Pure.
 */
export function overviewExecutionOf(listing: SpecificationListing): OverviewExecutionFacts {
  const first = listing.attention[0];
  const titles = listing.taskTitles;
  const named = first
    ? [...(first.subject.kind === 'task' ? [first.subject.taskId] : []), ...itemTaskIds(first)]
    : [];
  const taskTitles = Object.fromEntries(
    named.flatMap((taskId) => {
      const title = titles.get(taskId);

      return title === undefined ? [] : [[taskId, title] as const];
    }),
  );

  return {
    progress: { completed: listing.progress.completed, total: listing.progress.total },
    workflow: overviewWorkflowOf(listing),
    attention: listing.attention.length,
    ...(first
      ? {
          firstAttention: {
            first: workspaceAttentionOf(first, titles),
            ...(Object.keys(taskTitles).length > 0 ? { taskTitles } : {}),
          },
        }
      : {}),
  };
}

/** Where an unexpected list read failure is reported (the Runtime's logger). */
export interface OverviewExecutionLog {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

/**
 * The Specs list facts of the listed Specifications, ONE Engine read of all of them
 * (`readSpecificationListings`: one short project control lock section per Specification, the
 * Overview's rules without its action projections, no Git): the definitions are loaded once. One
 * whose execution cannot be read says why (`unreadable`), never a guessed position or count; the
 * other rows are unaffected. A file that cannot be read is logged as a warning, an unexpected
 * failure as an error, each with the Specification and the error.
 */
export function createEngineOverviewExecution(
  source: TaskEngine,
  log?: OverviewExecutionLog,
): OverviewExecutionSource {
  return async (specIds) => {
    const facts = new Map<string, OverviewExecutionRead>();
    if (specIds.length === 0) {
      return facts;
    }

    const all = (reason: SpecificationListingFailure, error: unknown) => {
      report(log, reason, error, specIds);

      return new Map(specIds.map((specId) => [specId, { kind: 'unreadable', reason } as const]));
    };

    let workflow;
    try {
      workflow = await source.openWorkflow();
    } catch (error) {
      return all(listingFailureOf(error), error);
    }

    let listings;
    try {
      listings = await readSpecificationListingsForRead(workflow, specIds);
    } catch (error) {
      return all(listingFailureOf(error), error);
    }

    for (const specId of specIds) {
      const read = listings.get(specId);
      if (read?.kind === 'read') {
        facts.set(specId, { kind: 'read', ...overviewExecutionOf(read.listing) });
      } else {
        const reason = read?.reason ?? 'unexpected';
        report(log, reason, read?.error, [specId]);
        facts.set(specId, { kind: 'unreadable', reason });
      }
    }

    return facts;
  };
}

function report(
  log: OverviewExecutionLog | undefined,
  reason: SpecificationListingFailure,
  error: unknown,
  specIds: readonly string[],
) {
  if (reason === 'unexpected') {
    log?.error({ err: error, specIds }, 'The workflow of a listed Specification could not be read');
  } else if (reason === 'filesystem') {
    log?.warn(
      { err: error, specIds },
      'The workflow files of a listed Specification could not be read',
    );
  }
}
