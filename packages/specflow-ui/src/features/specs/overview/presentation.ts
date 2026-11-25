import type {
  ArchivedSpecOverviewItem,
  CurrentSpecOverviewItem,
  CurrentSpecSectionId,
  CurrentSpecAttentionReason,
  CurrentSpecWorkflow,
  SpecOverviewItem,
  SpecsOverview,
} from './model';

type Tags = readonly [] | readonly [string] | readonly [string, string];
type PullRequests =
  { kind: 'single'; number: number; href: string } | { kind: 'multiple'; count: number };

type WorkflowStep = Extract<CurrentSpecWorkflow, { kind: 'step' }>;

/**
 * What the row says about where the Specification's workflow stands, the Overview's Now in one or
 * two lines: the step title, then its place and who or what it waits for.
 */
export type WorkflowLine =
  | { kind: 'not-started'; stepCount?: number; firstStep?: string }
  | {
      kind: 'step';
      title?: string;
      position?: { position: number; total: number };
      detail?:
        | { kind: 'agent-working' }
        | { kind: 'in-progress' }
        | { kind: 'ready' }
        | { kind: 'tasks-ready'; count: number }
        | { kind: 'tasks-in-progress'; count: number }
        | { kind: 'waiting-for'; count: number; total: number };
    }
  | { kind: 'ended'; outcome: 'completed' | 'abandoned'; stepCount?: number };

type CurrentSummary =
  | { kind: 'attention'; reason?: CurrentSpecAttentionReason; count?: number }
  | { kind: 'sessions'; executionCount: number }
  | { kind: 'workflow'; line: WorkflowLine }
  | { kind: 'unknown' };

interface RowIdentity {
  readonly id: string;
  readonly title: string;
  readonly key?: string;
  readonly progress: { completed: number; total: number } | null;
  readonly tags: Tags;
  readonly omittedTags: number;
  readonly pullRequests?: PullRequests;
  /** When the specification last changed; shown in its own column when the list has no work status. */
  readonly updatedAt?: string;
}

export interface CurrentSpecRowModel extends RowIdentity {
  readonly collection: 'current';
  readonly sectionId: CurrentSpecSectionId;
  readonly summary: CurrentSummary;
  /** Under an attention summary: where the workflow stands, so the row still names the step. */
  readonly workflow?: WorkflowLine;
  readonly qualifier?: { executionCount: number };
}

export interface ArchiveSpecRowModel extends RowIdentity {
  readonly collection: 'archive';
  readonly history:
    { kind: 'completed'; timestamp: string } | { kind: 'archived'; timestamp?: string };
}

export type SpecRowModel = CurrentSpecRowModel | ArchiveSpecRowModel;

function identity(item: SpecOverviewItem): RowIdentity {
  const [first, second] = item.tags ?? [];
  const tags: Tags = first === undefined ? [] : second === undefined ? [first] : [first, second];
  const prs = item.pullRequests ?? [];
  const pr = prs[0];

  return {
    id: item.id,
    title: item.title,
    key: item.key,
    progress: item.progress,
    tags,
    omittedTags: Math.max(0, (item.tags?.length ?? 0) - 2),
    pullRequests:
      prs.length > 1
        ? { kind: 'multiple', count: prs.length }
        : pr
          ? { kind: 'single', number: pr.number, href: pr.url }
          : undefined,
  };
}

export function currentRow(item: CurrentSpecOverviewItem): CurrentSpecRowModel {
  const executionCount = item.currentExecutions?.length ?? 0;
  const summary = currentSummary(item);
  const workflow =
    summary.kind === 'attention' && item.workflow ? workflowLine(item.workflow) : undefined;

  return {
    ...identity(item),
    updatedAt: item.updatedAt,
    collection: 'current',
    sectionId: item.classification.section,
    summary,
    // One concurrent qualifier at most, under an attention summary only: the workflow position
    // wins over the Session count.
    ...(workflow ? { workflow } : {}),
    qualifier:
      summary.kind === 'attention' && !workflow && executionCount > 0
        ? { executionCount }
        : undefined,
  };
}

/** The row's words for where the workflow stands; never the manifest status. Pure. */
export function workflowLine(workflow: CurrentSpecWorkflow): WorkflowLine {
  if (workflow.kind !== 'step') {
    return workflow;
  }

  const detail = stepDetail(workflow);

  return {
    kind: 'step',
    ...(workflow.step
      ? {
          title: workflow.step.title,
          position: { position: workflow.step.position, total: workflow.step.count },
        }
      : {}),
    ...(detail ? { detail } : {}),
  };
}

function stepDetail(workflow: WorkflowStep): Extract<WorkflowLine, { kind: 'step' }>['detail'] {
  switch (workflow.state) {
    case 'active':
      return workflow.actor === 'agent' ? { kind: 'agent-working' } : { kind: 'in-progress' };
    case 'ready':
      return { kind: 'ready' };
    case 'waiting': {
      const tasks = workflow.tasks;
      if (!tasks) {
        return undefined;
      }

      // What the owner can do first (start a Task), then what runs, then what is left.
      return tasks.readyToStart > 0
        ? { kind: 'tasks-ready', count: tasks.readyToStart }
        : tasks.inProgress > 0
          ? { kind: 'tasks-in-progress', count: tasks.inProgress }
          : { kind: 'waiting-for', count: tasks.open, total: tasks.total };
    }
  }
}

export function archiveRow(item: ArchivedSpecOverviewItem): ArchiveSpecRowModel {
  return {
    ...identity(item),
    collection: 'archive',
    history:
      item.completedAt !== undefined
        ? { kind: 'completed', timestamp: item.completedAt }
        : { kind: 'archived', timestamp: item.archivedAt },
  };
}

export function sortArchiveItems(items: readonly ArchivedSpecOverviewItem[]) {
  const milestone = (item: ArchivedSpecOverviewItem) => {
    const value = Date.parse(item.completedAt ?? item.archivedAt ?? '');

    return Number.isFinite(value) ? value : -Infinity;
  };

  return [...items].sort((a, b) => {
    const left = milestone(a);
    const right = milestone(b);

    return left === right ? a.id.localeCompare(b.id) : right > left ? 1 : -1;
  });
}

function currentSummary(item: CurrentSpecOverviewItem): CurrentSummary {
  switch (item.classification.section) {
    case 'requires-attention':
      return {
        kind: 'attention',
        ...(item.classification.reason === undefined ? {} : { reason: item.classification.reason }),
        ...(item.classification.count === undefined ? {} : { count: item.classification.count }),
      };

    case 'in-progress':
      // A Session executes while the workflow position is unknown (demo evidence only).
      return item.workflow?.kind === 'step'
        ? { kind: 'workflow', line: workflowLine(item.workflow) }
        : { kind: 'sessions', executionCount: item.currentExecutions?.length ?? 0 };

    case 'not-started':
    case 'ended':
      return item.workflow
        ? { kind: 'workflow', line: workflowLine(item.workflow) }
        : { kind: 'unknown' };

    case 'unknown':
      return { kind: 'unknown' };
  }
}

export function rowProgress(
  progress: RowIdentity['progress'],
): 'invalid' | 'empty' | 'ready' | 'unknown' {
  if (progress === null) {
    return 'unknown';
  }

  return !Number.isSafeInteger(progress.total) ||
    progress.total < 0 ||
    !Number.isSafeInteger(progress.completed) ||
    progress.completed < 0 ||
    progress.completed > progress.total
    ? 'invalid'
    : progress.total === 0
      ? 'empty'
      : 'ready';
}

type RowMetadataFact =
  { id: string; kind: 'key' | 'tag' | 'omitted'; value: string } | { id: 'pr'; kind: 'pr' };
export function rowMetadata(item: SpecRowModel): readonly RowMetadataFact[] {
  return [
    ...(item.key ? [{ id: 'key', kind: 'key' as const, value: item.key }] : []),
    ...item.tags.map((tag, index) => ({ id: `tag-${index}`, kind: 'tag' as const, value: tag })),
    ...(item.omittedTags
      ? [{ id: 'omitted', kind: 'omitted' as const, value: `+${item.omittedTags}` }]
      : []),
    ...(item.collection === 'current' && item.pullRequests
      ? [{ id: 'pr' as const, kind: 'pr' as const }]
      : []),
  ];
}

/**
 * Which facts the Runtime really provides for the current list. A project Runtime may know the
 * specifications but not their work status or progress; the list then must not draw groups and
 * columns of "unavailable". Decided from the whole collection (never from a search result, so
 * typing does not change the layout): status exists when any specification has a real section,
 * progress when any has a progress. The archive always has its own milestone and pull-request
 * columns, and an empty collection keeps the full layout (nothing to flatten).
 */
export interface OverviewCapabilities {
  readonly status: boolean;
  readonly progress: boolean;
}

export function overviewCapabilities(projection: SpecsOverview): OverviewCapabilities {
  if (projection.collection === 'archive' || projection.items.length === 0) {
    return { status: true, progress: true };
  }

  return {
    status: projection.items.some((item) => item.classification.section !== 'unknown'),
    progress: projection.items.some((item) => item.progress !== null),
  };
}
