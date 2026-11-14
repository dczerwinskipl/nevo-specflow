import type { TFunction } from 'i18next';
import type { TaskProgressData } from '../../specs/read-model';

/**
 * Progress, one definition (Now and the Tasks page): "1 of 6 done · 1 cancelled · 1 ended · 1 on
 * hold", zero parts omitted. The counts are the Runtime's; nothing is recounted here.
 */
export function progressText(progress: TaskProgressData, t: TFunction): string {
  return [
    t('taskOverview.progress.done', { completed: progress.completed, total: progress.total }),
    ...namedParts(progress, t),
  ].join(' · ');
}

function namedParts(progress: TaskProgressData, t: TFunction): string[] {
  return [
    ...(progress.cancelled
      ? [t('taskOverview.progress.cancelled', { count: progress.cancelled })]
      : []),
    ...(progress.ended ? [t('taskOverview.progress.ended', { count: progress.ended })] : []),
    ...(progress.onHold ? [t('taskOverview.progress.onHold', { count: progress.onHold })] : []),
  ];
}

/**
 * A terminal Specification's Tasks: "All 6 tasks done · 1 cancelled", or after an abandon "6 tasks
 * cancelled · 1 done". Undefined without Tasks.
 */
export function terminalSummary(
  progress: TaskProgressData,
  outcome: 'completed' | 'abandoned',
  t: TFunction,
): string | undefined {
  const { completed, total, cancelled = 0, ended = 0 } = progress;
  if (total + cancelled + ended === 0) {
    return undefined;
  }

  if (outcome === 'abandoned') {
    return [
      t('taskOverview.terminal.cancelled', { count: cancelled }),
      t('taskOverview.terminal.done', { count: completed }),
      ...(ended ? [t('taskOverview.progress.ended', { count: ended })] : []),
    ].join(' · ');
  }

  return [
    completed === total
      ? t('taskOverview.terminal.allDone', { count: total })
      : t('taskOverview.progress.done', { completed, total }),
    ...namedParts({ ...progress, onHold: 0 }, t),
  ].join(' · ');
}
