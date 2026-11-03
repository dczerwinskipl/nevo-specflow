import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import { Icon, Typography, cn, fastColorTransitionClassName } from '@nevo/ui';
import { formatWorkClockRange, formatWorkDuration, workItemDurationMs } from './workGrouping';
import { workStateTextClassName, workStateTone } from './workStatus';

type Timed = Pick<WorkSummary, 'state' | 'createdAt' | 'updatedAt'>;

/** Localized elapsed time of a settled item, or `undefined` while it runs / when unknown — never a
 * fabricated "0 ms" (`workItemDurationMs`). */
export function useWorkDurationLabel(item: Timed): string | undefined {
  const { i18n } = useTranslation();
  const ms = workItemDurationMs(item);

  return ms === undefined ? undefined : formatWorkDuration(ms, i18n.language);
}

/** Localized wall-clock start–end of a settled item, e.g. "14:32:05–14:32:06", or `undefined` on
 * the same terms as {@link useWorkDurationLabel} (owner review, round four: "Dodaj też zegarowy
 * start/koniec" — only the ToolAction detail header uses this, visibly only for long runs and
 * otherwise as the duration's tooltip, `ToolActionHeader.tsx`; L2's compact rows keep just the
 * duration). */
export function useWorkClockRangeLabel(item: Timed): string | undefined {
  const { i18n } = useTranslation();

  return formatWorkClockRange(item, i18n.language);
}

/**
 * The one optional line under a Work row's title (owner brief: "pod tytułem opcjonalna linia
 * metadanych"): the state only when it says something (anything but a plain completion — never
 * "Zakończono" on every successful row; the word stays for assistive tech), then elapsed time,
 * then how many ToolActions the details hold. Absent entirely when there is nothing worth saying,
 * so a row never gets an empty second line.
 */
export function useWorkRowMeta(
  item: Timed,
  options: { actionCount?: number; leading?: string } = {},
): { meta?: ReactNode; srStatus?: ReactNode } {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(item);
  const stateLabel = t(`managedSession.workState.${item.state}`);
  const parts: ReactNode[] = [];
  if (options.leading) {
    parts.push(options.leading);
  }

  if (item.state !== 'completed') {
    parts.push(
      <span key="state" className={workStateTextClassName(workStateTone(item.state))}>
        {stateLabel}
      </span>,
    );
  }

  if (duration) {
    parts.push(duration);
  }

  // Only shown for 2+ (owner review, round four: "1 działanie" on every multi-action row said
  // nothing a single action's own title didn't already — the count only earns its place once
  // there's actually more than one to count).
  if (options.actionCount && options.actionCount > 1) {
    parts.push(t('managedSession.workInspector.actionCount', { count: options.actionCount }));
  }

  const meta =
    parts.length > 0
      ? parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))
      : undefined;

  return {
    meta,
    srStatus:
      item.state === 'completed' ? <span className="sr-only">, {stateLabel}</span> : undefined,
  };
}

/**
 * One Work row's content — the same anatomy for a top-level operation on the Timeline rail, a
 * member of an expanded tool group, and a ToolAction header (owner brief "Work Item jako wiersz
 * nawigacyjny"):
 *
 * ```text
 * [ title (wraps) ............................ ]  [ > ]
 * [ meta: Niepowodzenie · 8,4 s · 1 działanie ]
 * ```
 *
 * Title in neutral `text-content-primary` (never link-blue/underlined), the optional meta line
 * under it, and — only when a details view really exists (`onOpen`) — a navigation chevron on the
 * right, centred on the whole row's height. With `onOpen` the whole row is ONE button, the same
 * idiom as Session Context's `ContextNavigationRow`: a subtle hover/focus surface that bleeds
 * outward (here also over the Timeline marker column, `bleed="rail"`) instead of moving content.
 * Without `onOpen` nothing pretends to be clickable.
 */
export function WorkRowContent({
  title,
  meta,
  onOpen,
  bleed = 'row',
}: {
  title: ReactNode;
  meta?: ReactNode;
  onOpen?: () => void;
  /** `rail`: the hover surface also covers the Timeline marker column to the left. */
  bleed?: 'rail' | 'row';
}) {
  const body = (
    <>
      <span className="relative grid min-w-0 gap-0.5">
        <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        {meta && (
          <Typography
            as="span"
            variant="body-sm"
            className="block min-w-0 font-normal text-content-muted [overflow-wrap:anywhere]"
          >
            {meta}
          </Typography>
        )}
      </span>
      {onOpen ? (
        <Icon
          name="chevron-right"
          size="sm"
          aria-hidden="true"
          className="relative text-content-muted transition-colors group-hover/work-row:text-content-secondary"
        />
      ) : (
        <span aria-hidden="true" />
      )}
    </>
  );
  const grid =
    'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_var(--spacing-icon-sm)] items-center gap-x-3 text-left';

  if (!onOpen) {
    return <span className={grid}>{body}</span>;
  }

  return (
    <button
      type="button"
      data-focus-ring="delegated"
      onClick={onOpen}
      className={cn(
        grid,
        'group/work-row relative cursor-pointer outline-none',
        "before:absolute before:-inset-y-1.5 before:right-[-0.5rem] before:rounded-control before:content-['']",
        bleed === 'rail' ? 'before:left-[-2.5rem]' : 'before:left-[-0.5rem]',
        'before:transition-colors before:[transition-duration:var(--motion-duration-fast)] motion-reduce:before:transition-none',
        'hover:before:bg-surface-hover focus-visible:before:outline-2 focus-visible:before:outline-focus-ring',
        fastColorTransitionClassName,
      )}
    >
      {body}
    </button>
  );
}
