import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolActionSummary } from '@nevo/specflow-contracts/sessions';
import { Icon, Spinner, Typography } from '@nevo/ui';
import { useWorkClockRangeLabel, useWorkDurationLabel } from './WorkRow';
import { workItemDurationMs } from './workGrouping';
import { workStateTextClassName, workStateTone, type WorkStateTone } from './workStatus';

/**
 * From this duration on the wall-clock start–end is shown in the header itself: start and end then
 * differ by at least a minute, so the range says when the action ran and for how long at a glance.
 * Below it the two clock times are (nearly) identical — "10:00:00–10:00:00" next to "200 ms" read
 * as a contradiction — so the range stays reachable on demand only, as the duration's tooltip.
 */
export const CLOCK_RANGE_VISIBLE_FROM_MS = 60_000;

/** The discreet status mark before the status line; nothing for neutral states (queued, waiting). */
function StatusGlyph({ tone }: { tone: WorkStateTone }) {
  switch (tone) {
    case 'success':
      return <Icon name="circle-check" size="sm" className="shrink-0 text-status-success" />;
    case 'danger':
      return <Icon name="circle-alert" size="sm" className="shrink-0 text-status-danger" />;
    case 'attention':
      return <Icon name="triangle-alert" size="sm" className="shrink-0 text-status-attention" />;
    case 'info':
      return <Spinner size="sm" className="shrink-0" />;
    default:
      return null;
  }
}

/**
 * The status line under a ToolAction's title: its real state, then its duration. Typed data only —
 * the contract has no tool kind or subject, so nothing is parsed out of the title or the output.
 *
 * - Completed: a discreet success icon; the state word is for assistive technology only (a visible
 *   "Zakończono" on every action said nothing), the duration is the visible fact.
 * - Failed, cancelled, interrupted: icon plus the visible state word (never colour alone); the
 *   readable error message is the alert below the header.
 * - Running and other unsettled states: the real state ("W toku"), never a duration or a success.
 * - Wall-clock range: see `CLOCK_RANGE_VISIBLE_FROM_MS`.
 *
 * `glyph={false}` inside the Timeline of several actions, whose marker already carries the state.
 */
function ToolActionStatus({ item, glyph }: { item: ToolActionSummary; glyph: boolean }) {
  const { t } = useTranslation();
  const tone = workStateTone(item.state);
  const stateLabel = t(`managedSession.workState.${item.state}`);
  const duration = useWorkDurationLabel(item);
  const clockRange = useWorkClockRangeLabel(item);
  const longRun = (workItemDurationMs(item) ?? 0) >= CLOCK_RANGE_VISIBLE_FROM_MS;
  const parts: ReactNode[] = [];
  if (item.state !== 'completed') {
    parts.push(
      <span key="state" className={workStateTextClassName(tone)}>
        {stateLabel}
      </span>,
    );
  }

  if (duration) {
    parts.push(
      <time
        key="duration"
        dateTime={`PT${(workItemDurationMs(item) ?? 0) / 1000}S`}
        title={clockRange}
      >
        {duration}
      </time>,
    );
  }

  if (clockRange && longRun) {
    parts.push(<span key="range">{clockRange}</span>);
  }

  return (
    <Typography
      as="p"
      variant="body-sm"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-content-muted"
      data-tool-action-status={item.state}
    >
      {glyph && <StatusGlyph tone={tone} />}
      {item.state === 'completed' && <span className="sr-only">{stateLabel}</span>}
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <span key={`separator-${index}`} aria-hidden="true">
                ·
              </span>,
              part,
            ],
      )}
    </Typography>
  );
}

/**
 * A ToolAction's header: its full title (the contract's only name for it — never shortened or
 * re-derived), then the status line. `asHeading`: the single-action screen's own heading.
 */
export function ToolActionHeader({
  item,
  asHeading,
}: {
  item: ToolActionSummary;
  asHeading: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      {asHeading ? (
        <Typography
          as="h2"
          variant="title-sm"
          className="min-w-0 text-content-primary [overflow-wrap:anywhere]"
        >
          {item.title.text}
        </Typography>
      ) : (
        <span className="min-w-0 text-content-primary [overflow-wrap:anywhere]">
          {item.title.text}
        </span>
      )}
      <ToolActionStatus item={item} glyph={asHeading} />
    </div>
  );
}
