import type { TFunction } from 'i18next';
import type { ToolOperation, WorkDigest } from '@nevo/specflow-contracts/sessions';
import type { LiveActivity, WorkBlockModel } from './workBlockModel';

/** Display order: what changed the workspace and what verified it first, lookups after. */
export const toolOperationOrder: readonly ToolOperation[] = [
  'edit',
  'write',
  'command',
  'test',
  'read',
  'search',
  'list',
  'web',
  'other',
];

/** Breakdown segments beyond this collapse into "i więcej" so the line stays one glance. */
export const WORK_SUMMARY_MAX_SEGMENTS = 4;

/**
 * The kind a group of tool actions is shown by: the one it holds most of, the earlier kind of the
 * display order on a tie (workspace changes before lookups); `other` for an empty or unknown group.
 */
export function leadingOperation(counts: WorkDigest['opened'] | undefined): ToolOperation {
  let leading: ToolOperation = 'other';
  let most = 0;
  for (const operation of toolOperationOrder) {
    const count = counts?.[operation] ?? 0;
    if (count > most) {
      leading = operation;
      most = count;
    }
  }

  return leading;
}

/** Human-readable lines for one Work block (full-session.md "Work block"). */
export interface WorkBlockText {
  /** The row's title: how many tool actions ("6 tool actions"), or the one kind they all were
   * ("2 commands"); the honest loaded count without a digest. */
  title?: string;
  /** The breakdown under the title when the actions were of several kinds ("5 commands · 1 read"). */
  detail?: string;
  /** The kind the row is shown by (its icon): the one it holds most of. */
  operation: ToolOperation;
  /** Cumulative "what it has done", e.g. "4 odczyty · 50 zapisów · 3 polecenia i więcej". */
  summary?: string;
  /** Failed tool actions, e.g. "Nie powiodło się: 1 uruchomienie testów". */
  failed?: string;
  /** What is happening right now (active Turn only). */
  live?: string;
}

function present(counts: WorkDigest['opened'] | undefined) {
  return toolOperationOrder.filter((kind) => (counts?.[kind] ?? 0) > 0);
}

function kindList(counts: WorkDigest['opened'], t: TFunction) {
  return present(counts).map((kind) =>
    t(`managedSession.workSummary.kind.${kind}`, { count: counts[kind] }),
  );
}

function liveText(live: LiveActivity, t: TFunction): string {
  switch (live.kind) {
    case 'tool':
      return live.label
        ? t('managedSession.workSummary.live.tool', { label: live.label })
        : t('managedSession.workSummary.live.toolUnnamed');
    case 'reasoning':
      return t('managedSession.workSummary.live.reasoning');
    case 'responding':
      return t('managedSession.workSummary.live.responding');
    case 'commentary':
      return t('managedSession.workSummary.live.commentary');
    case 'waiting':
      return live.label ?? t('managedSession.workSummary.live.waiting');
    case 'cancelling':
      return t('managedSession.workSummary.live.cancelling');
    default:
      return live.label ?? t('managedSession.workSummary.live.working');
  }
}

export function describeWorkBlock(block: WorkBlockModel, t: TFunction): WorkBlockText {
  const { digest } = block;
  let summary: string | undefined;

  if (digest) {
    const segments = kindList(digest.opened, t);
    summary =
      segments.length > 0
        ? segments.slice(0, WORK_SUMMARY_MAX_SEGMENTS).join(' · ') +
          (segments.length > WORK_SUMMARY_MAX_SEGMENTS
            ? ' ' + t('managedSession.workSummary.more')
            : '')
        : undefined;
  } else if (block.actionCount > 0) {
    // No digest (a Turn recorded before Runtime maintained one, or before its first ToolAction):
    // only "one tool Work was opened" per loaded entry is known.
    summary = t(
      block.partial
        ? 'managedSession.workSummary.actionsAtLeast'
        : 'managedSession.workSummary.actions',
      { count: block.actionCount },
    );
  }

  const failedKinds = digest?.failed ? kindList(digest.failed, t) : [];
  const kinds = present(digest?.opened);
  const total = kinds.reduce((sum, kind) => sum + (digest?.opened[kind] ?? 0), 0);
  const several = kinds.length > 1;

  return {
    title: several ? t('managedSession.workSummary.actions', { count: total }) : summary,
    detail: several ? summary : undefined,
    operation: leadingOperation(digest?.opened),
    summary,
    failed:
      failedKinds.length > 0
        ? t('managedSession.workSummary.failed', { list: failedKinds.join(', ') })
        : undefined,
    live: block.live ? liveText(block.live, t) : undefined,
  };
}
