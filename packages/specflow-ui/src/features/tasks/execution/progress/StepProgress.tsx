import type { ReactNode } from 'react';
import { Progress, Typography, cn } from '@nevo/ui';
import type { StepTrack } from '../presentation';

/**
 * Where a Specification's workflow stands. Shared by the Specification's Now and the Specifications
 * list; the track carries the accessible name, so the visible count is not read twice.
 *
 * - `block` (the Now): the step's title with its position ("Step 6 of 7") on one line, the DS
 *   segmented position track under it;
 * - `compact` (a list row): the same grammar in body text, as the list's Task progress
 *   (`TaskProgress` compact) beside or under it: the title with its position on the track's own
 *   label line, the track across the full width under it, then `detail` ("Attempt 1 · agent working
 *   since 11:18"). A row whose run has no place among the steps (a finished run) has no track, only
 *   its title and detail.
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
  /** Compact only: the line under the track. */
  readonly detail?: ReactNode;
}) {
  if (variant === 'compact') {
    // Before the start the count is "7 steps": the first step's name goes to the line under it.
    const position = track && track.label !== track.count ? track.label : undefined;

    return (
      <span
        className="flex min-w-0 flex-col gap-1.5 [overflow-wrap:anywhere]"
        data-step-progress=""
      >
        <span className="flex min-w-0 items-baseline justify-between gap-x-3">
          <span
            className={cn('min-w-0 text-content-primary', titleClassName)}
            data-step-progress-title=""
          >
            {title}
          </span>
          {track ? (
            <span
              aria-hidden="true"
              className="shrink-0 whitespace-nowrap text-content-secondary"
              data-step-progress-count=""
            >
              {track.count}
            </span>
          ) : null}
        </span>
        {track ? (
          <span className="flex min-w-0" data-step-progress-track="">
            <Progress
              variant="segmented"
              size="compact"
              width="fill"
              position={track.position}
              total={track.total}
              aria-label={track.ariaLabel}
            />
          </span>
        ) : null}
        {position || detail ? (
          <span className="text-content-secondary" data-step-progress-detail="">
            {position ? <span aria-hidden="true">{position}</span> : null}
            {position && detail ? ' · ' : null}
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
