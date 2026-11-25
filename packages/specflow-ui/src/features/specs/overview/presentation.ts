import type { SituationAttention } from '../../tasks';
import { mapAttentionItem } from '../read-model';
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

/**
 * What a current row says about its Specification:
 *
 * - `workflow`: where its workflow run stands, the Overview's Now in a few lines; with `attention`
 *   when the workflow needs a person (the item the Overview's Requires attention lists first);
 * - `attention`: an attention signal that is not the workflow's (a Session, demo evidence only);
 * - `sessions`: Sessions execute while the workflow position is unknown (demo evidence only);
 * - `unreadable`: the workflow could not be read, and why;
 * - `unknown`: no work status.
 */
export type CurrentSummary =
  | { kind: 'workflow'; workflow: CurrentSpecWorkflow; attention?: SituationAttention }
  | { kind: 'attention'; reason?: CurrentSpecAttentionReason; count?: number }
  | { kind: 'sessions'; executionCount: number }
  | { kind: 'unreadable'; reason: CurrentSpecUnreadableReason }
  | { kind: 'unknown' };

export type CurrentSpecUnreadableReason = NonNullable<
  CurrentSpecOverviewItem['unreadable']
>['reason'];

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
  /** Under an attention signal: where the workflow stands, so the row still names the step. */
  readonly workflow?: CurrentSpecWorkflow;
  readonly qualifier?: { executionCount: number };
  /** An abandoned run shows no Task progress: it says it was abandoned, and when. */
  readonly hideProgress?: boolean;
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
  const workflow = summary.kind === 'attention' && item.workflow ? item.workflow : undefined;

  return {
    ...identity(item),
    updatedAt: item.updatedAt,
    collection: 'current',
    sectionId: item.classification.section,
    summary,
    // One concurrent qualifier at most, under an attention signal only: the workflow position
    // wins over the Session count.
    ...(workflow ? { workflow } : {}),
    qualifier:
      summary.kind === 'attention' && !workflow && executionCount > 0
        ? { executionCount }
        : undefined,
    ...(item.workflow?.kind === 'ended' && item.workflow.outcome === 'abandoned'
      ? { hideProgress: true }
      : {}),
  };
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
  if (item.unreadable) {
    return { kind: 'unreadable', reason: item.unreadable.reason };
  }

  switch (item.classification.section) {
    case 'requires-attention':
      // The workflow's own attention: the row names the item the Overview lists first.
      if (item.workflow && item.attention) {
        return {
          kind: 'workflow',
          workflow: item.workflow,
          attention: {
            first: mapAttentionItem(item.attention.first),
            ...(item.attention.taskTitles ? { taskTitles: item.attention.taskTitles } : {}),
            count: item.classification.count ?? 1,
          },
        };
      }

      return {
        kind: 'attention',
        ...(item.classification.reason === undefined ? {} : { reason: item.classification.reason }),
        ...(item.classification.count === undefined ? {} : { count: item.classification.count }),
      };

    case 'in-progress':
      // A Session executes while the workflow position is unknown (demo evidence only).
      return item.workflow?.kind === 'step'
        ? { kind: 'workflow', workflow: item.workflow }
        : { kind: 'sessions', executionCount: item.currentExecutions?.length ?? 0 };

    case 'not-started':
    case 'ended':
      return item.workflow ? { kind: 'workflow', workflow: item.workflow } : { kind: 'unknown' };

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
