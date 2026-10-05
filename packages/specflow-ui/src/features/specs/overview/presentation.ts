import type { SpecsOverviewSummary } from '@nevo/specflow-contracts/specs-overview';
import type { SpecSteeringItemProjection, SpecsOverviewGroupId } from './model';

type Tags = readonly [] | readonly [string] | readonly [string, string];
type PullRequests =
  { kind: 'single'; number: number; href: string } | { kind: 'multiple'; count: number };
interface RowIdentity {
  readonly id: string;
  readonly title: string;
  readonly key?: string;
  readonly progress: { completed: number; total: number };
  readonly tags: Tags;
  readonly omittedTags: number;
  readonly pullRequests?: PullRequests;
}
export interface ActiveSpecRowModel extends RowIdentity {
  readonly collection: 'active';
  readonly groupId: SpecsOverviewGroupId;
  readonly summary: SpecsOverviewSummary;
  readonly qualifier?: { executionCount: number };
}
export interface ArchiveSpecRowModel extends RowIdentity {
  readonly collection: 'archive';
  readonly history:
    { kind: 'completed'; timestamp: string } | { kind: 'archived'; timestamp?: string };
}
export type SpecRowModel = ActiveSpecRowModel | ArchiveSpecRowModel;

function identity(item: SpecSteeringItemProjection): RowIdentity {
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
export function activeRow(item: SpecSteeringItemProjection): ActiveSpecRowModel {
  return {
    ...identity(item),
    collection: 'active',
    groupId: item.groupId,
    summary: item.steeringAvailable === false ? { kind: 'unavailable' } : item.overviewSummary,
    qualifier: item.concurrentWork,
  };
}
export function archiveRow(item: SpecSteeringItemProjection): ArchiveSpecRowModel {
  return {
    ...identity(item),
    collection: 'archive',
    history: item.completedAt
      ? { kind: 'completed', timestamp: item.completedAt }
      : { kind: 'archived', timestamp: item.archivedAt },
  };
}
