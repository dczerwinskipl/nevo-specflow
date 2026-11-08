import type { TFunction } from 'i18next';
import type { ToolOperation, WorkDigest } from '@nevo/specflow-contracts/sessions';
import type { LiveActivity, WorkBlockModel } from './workBlockModel';
import { workStateTone } from './workStatus';

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

/** Human-readable lines for one Work block (session-chat-v10-design.md §3.1). */
export interface WorkBlockText {
  /** Cumulative "what it has done", e.g. "4 odczyty · 50 zapisów · 3 polecenia i więcej". */
  summary?: string;
  /** Failed tool actions, e.g. "Nie powiodło się: 1 uruchomienie testów". */
  failed?: string;
  /** The Turn's own terminal outcome when it was not a plain completion. */
  outcome?: { text: string; tone: 'danger' | 'attention' };
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

/** The Turn's non-plain terminal outcome, toned by the SAME state vocabulary Work history uses for
 * its rows (`workStatus.ts`), so "interrupted" is attention-toned in both views, never re-decided. */
function outcomeText(outcome: string | undefined, t: TFunction): WorkBlockText['outcome'] {
  if (outcome !== 'failed' && outcome !== 'cancelled' && outcome !== 'interrupted') {
    return undefined;
  }

  const tone = workStateTone(outcome);

  return {
    text: t(`managedSession.workSummary.outcome.${outcome}`),
    tone: tone === 'danger' ? 'danger' : 'attention',
  };
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

  return {
    summary,
    failed:
      failedKinds.length > 0
        ? t('managedSession.workSummary.failed', { list: failedKinds.join(', ') })
        : undefined,
    outcome: outcomeText(block.outcome, t),
    live: block.live ? liveText(block.live, t) : undefined,
  };
}
