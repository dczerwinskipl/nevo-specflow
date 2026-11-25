import {
  readSpecificationListingForRead,
  type AttentionItem,
  type SpecificationListing,
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
import { isReadable, namedTaskIds, taskBoardOf } from '../presentation/board';
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
  | { readonly state: 'unavailable'; readonly reason: 'not_implemented' | 'source_unavailable' };

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
        overview: { ...overviewSummary(board.groups), ...(stuck ? { stuck } : {}) },
      },
    },
    preparationState: basis.reading.preparation,
  };
}

const unavailable: WorkspaceTasksContribution = {
  section: { state: 'unavailable', reason: 'source_unavailable' },
};

/**
 * The `tasks` contribution (a project Runtime's Engine, or the demo's in memory): one Engine
 * reading of every Task. An execution the Engine cannot read now (also a busy lock) degrades only
 * this section (`source_unavailable`).
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
        return unavailable;
      }

      throw error;
    }
  };
}

/** The Specs list facts of one Specification's execution (`OverviewExecutionRecord` of the Specs feature). */
export interface OverviewExecutionFacts {
  readonly progress: { readonly completed: number; readonly total: number };
  readonly workflow: CurrentSpecWorkflow;
  readonly attention: number;
}

export type OverviewExecutionSource = (
  specIds: readonly string[],
) => Promise<ReadonlyMap<string, OverviewExecutionFacts | null>>;

/** Where the Specification's run stands, as the Specs list contract carries it. Pure. */
export function overviewWorkflowOf(listing: SpecificationListing): CurrentSpecWorkflow {
  const { standing } = listing;
  if (standing.kind !== 'step') {
    return standing;
  }

  return {
    kind: 'step',
    state: standing.state,
    ...(standing.step ? { step: { ...standing.step } } : {}),
    ...(standing.actor ? { actor: standing.actor } : {}),
    ...(standing.state === 'waiting' ? { tasks: { ...listing.tasks } } : {}),
  };
}

/**
 * The Specs list facts of the listed Specifications, one Engine read of each
 * (`readSpecificationListing`: the Overview's inspection, no other action projection, no Git): the
 * definitions are loaded once. One whose execution cannot be read has `null` (not projected), never
 * a guessed position or count; the other rows are unaffected.
 */
export function createEngineOverviewExecution(source: TaskEngine): OverviewExecutionSource {
  return async (specIds) => {
    const facts = new Map<string, OverviewExecutionFacts | null>();
    if (specIds.length === 0) {
      return facts;
    }

    let workflow;
    try {
      workflow = await source.openWorkflow();
    } catch {
      return new Map(specIds.map((specId) => [specId, null]));
    }

    for (const specId of specIds) {
      try {
        const listing = await readSpecificationListingForRead(workflow, specId);
        facts.set(specId, {
          progress: { completed: listing.progress.completed, total: listing.progress.total },
          workflow: overviewWorkflowOf(listing),
          attention: listing.attention,
        });
      } catch {
        facts.set(specId, null);
      }
    }

    return facts;
  };
}
