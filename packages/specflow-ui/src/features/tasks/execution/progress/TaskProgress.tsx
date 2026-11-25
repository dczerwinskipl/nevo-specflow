import type { CSSProperties } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress, Typography } from '@nevo/ui';
import type { TaskProgressData } from '../../../specs/read-model';

/** Done work fills in the success tone, told apart from the step track's info-toned current step. */
const doneFill = { '--color-progress-fill': 'var(--color-status-success)' } as CSSProperties;

/**
 * A Specification's Task progress: "0 of 12 tasks done" with what else matters about its Tasks
 * ("5 ready to start · 1 on hold") on one line, one continuous bar under it. The counts are the
 * Runtime's; nothing is recounted here. Shared by the Specification's Now and the Specifications
 * list.
 */
export function TaskProgress({
  progress,
  ready,
}: {
  readonly progress: TaskProgressData;
  /** Tasks that can start now (the Runtime's "Ready to start" group), when known. */
  readonly ready?: number;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const side = [
    ...(ready ? [t('taskOverview.progress.readyToStart', { count: ready })] : []),
    ...(progress.cancelled
      ? [t('taskOverview.progress.cancelled', { count: progress.cancelled })]
      : []),
    ...(progress.ended ? [t('taskOverview.progress.ended', { count: progress.ended })] : []),
    ...(progress.onHold ? [t('taskOverview.progress.onHold', { count: progress.onHold })] : []),
  ].join(' · ');

  return (
    <div className="grid min-w-0 gap-2" data-now-tasks-progress="">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <Typography as="p" variant="title-sm" id={labelId} className="min-w-0">
          {t('taskOverview.progress.tasksDone', {
            completed: progress.completed,
            total: progress.total,
          })}
        </Typography>
        {side ? (
          <Typography as="p" variant="body-sm" className="min-w-0 text-content-secondary">
            {side}
          </Typography>
        ) : null}
      </div>
      <Progress
        value={progress.completed}
        max={progress.total}
        style={doneFill}
        aria-labelledby={labelId}
      />
    </div>
  );
}
