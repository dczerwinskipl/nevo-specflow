import type { ReactNode } from 'react';
import { Progress, Typography, cn } from '@nevo/ui';
import type { StepTrack } from '../presentation';

/**
 * Where a Specification's workflow stands: the step's title with its position ("Step 6 of 7") on
 * one line, the DS segmented position track under it. The track carries the accessible name; the
 * visible count is not read twice. Shared by the Specification's Now and the Specifications list.
 */
export function StepProgress({
  title,
  track,
  titleClassName,
}: {
  /** The step (or the run's state) as people read it. */
  readonly title: ReactNode;
  readonly track: StepTrack;
  readonly titleClassName?: string;
}) {
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
