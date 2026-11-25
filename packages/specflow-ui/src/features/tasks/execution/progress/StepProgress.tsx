import type { ReactNode } from 'react';
import { Progress, Typography, cn } from '@nevo/ui';
import type { StepTrack } from '../presentation';

/**
 * Where a Specification's workflow stands. Shared by the Specification's Now and the Specifications
 * list; the track carries the accessible name, so the visible count is not read twice.
 *
 * - `block` (the Now): the step's title with its position ("Step 6 of 7") on one line, the DS
 *   segmented position track under it;
 * - `compact` (a list row, whose column is narrow): the title, the compact track under it, then
 *   one line with the track's label and `detail` ("Step 6 of 7 · 5 ready to start"). A row whose
 *   run has no place among the steps (an abandoned run) has no track, only its detail.
 */
export function StepProgress({
  title,
  track,
  titleClassName,
  variant = 'block',
  detail,
}: {
  /** The step (or the run's state) as people read it. */
  readonly title: ReactNode;
  readonly track?: StepTrack;
  readonly titleClassName?: string;
  readonly variant?: 'block' | 'compact';
  /** Compact only: what else the row says on the track's line. */
  readonly detail?: ReactNode;
}) {
  if (variant === 'compact') {
    return (
      <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]" data-step-progress="">
        <span className={cn('text-content-primary', titleClassName)} data-step-progress-title="">
          {title}
        </span>
        {track ? (
          <span className="flex min-w-0" data-step-progress-track="">
            <Progress
              variant="segmented"
              size="compact"
              position={track.position}
              total={track.total}
              aria-label={track.ariaLabel}
            />
          </span>
        ) : null}
        {track || detail ? (
          <span className="text-content-secondary" data-step-progress-detail="">
            {track ? <span aria-hidden="true">{track.label}</span> : null}
            {track && detail ? ' · ' : null}
            {detail}
          </span>
        ) : null}
      </span>
    );
  }

  if (!track) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-2" data-step-progress="">
      <div className="flex min-w-0 items-baseline justify-between gap-x-3">
        <Typography
          as="p"
          variant="title-sm"
          className={cn('min-w-0 [overflow-wrap:anywhere]', titleClassName)}
        >
          {title}
        </Typography>
        <Typography
          as="p"
          variant="body-sm"
          aria-hidden="true"
          className="shrink-0 text-content-secondary"
          title={track.label !== track.count ? track.label : undefined}
          data-step-progress-count=""
        >
          {track.count}
        </Typography>
      </div>
      <Progress
        variant="segmented"
        position={track.position}
        total={track.total}
        aria-label={track.ariaLabel}
      />
    </div>
  );
}
