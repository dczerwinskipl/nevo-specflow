import { Icon, Progress, cn, type ProgressPosition } from '@nevo/ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { collectionWide } from '../../../../shared/operational-list';
import type { SpecRowModel, WorkflowLine } from '../presentation';
import { formatSpecDate } from './specDate';

export function SpecRowSummary({ item }: { readonly item: SpecRowModel }) {
  const { t, i18n } = useTranslation();
  if (item.collection === 'archive') {
    const history = item.history;
    const validDate = history.timestamp && Number.isFinite(Date.parse(history.timestamp));
    const date = validDate ? formatSpecDate(history.timestamp!, i18n.resolvedLanguage) : undefined;

    return (
      <span className={cn('flex flex-wrap gap-x-1', collectionWide.flexColumn)}>
        <span className={collectionWide.order2}>
          {t(`specifications.milestone.${history.kind}`)}
        </span>
        <span aria-hidden="true" className={collectionWide.hidden}>
          ·
        </span>
        {validDate ? (
          <time dateTime={history.timestamp}>{date}</time>
        ) : (
          <span>{t('specifications.dateUnavailable')}</span>
        )}
      </span>
    );
  }

  const summary = item.summary;
  if (summary.kind === 'workflow') {
    return (
      <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]" data-spec-reason>
        <WorkflowSituation line={summary.line} />
      </span>
    );
  }

  const text =
    summary.kind === 'attention'
      ? summary.reason
        ? t(`specifications.summary.${summary.reason}`, {
            count: summary.reason === 'review' ? 1 : (summary.count ?? 1),
          })
        : summary.count !== undefined
          ? t('specifications.summary.attentionItems', { count: summary.count })
          : t('specifications.sections.requiresAttention')
      : summary.kind === 'sessions'
        ? t('specifications.summary.active', { count: summary.executionCount })
        : t('specifications.summary.unknown');

  return (
    <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]" data-spec-reason>
      <span
        className={
          summary.kind === 'attention'
            ? 'font-medium text-status-attention'
            : 'text-content-secondary'
        }
      >
        {summary.kind === 'attention' ? (
          <Icon
            name={
              summary.reason === 'blocked'
                ? 'triangle-alert'
                : summary.reason === 'review'
                  ? 'file-search'
                  : 'chat'
            }
            size="sm"
            className="mr-1 inline-block align-text-bottom"
          />
        ) : null}
        {text}
      </span>
      {item.workflow ? (
        <WorkflowSituation line={item.workflow} />
      ) : item.qualifier ? (
        <span className="text-content-secondary">
          {t('specifications.summary.concurrent', { count: item.qualifier.executionCount })}
        </span>
      ) : null}
    </span>
  );
}

/** The step's position as the Overview's Now shows it: the DS segmented step track and its label. */
interface Track {
  readonly position: ProgressPosition;
  readonly total: number;
  readonly label: string;
  readonly ariaLabel: string;
}

/**
 * Where the workflow stands, by the visual rules of the Overview's Now (TODO(#169): use the shared
 * Now presentation components once #169 has extracted them): the step title, then the segmented step
 * track with "Step N of M", then who or what the step waits for. Completed has the success icon,
 * Abandoned the archive icon, muted. A line the row cannot fill is left out.
 */
function WorkflowSituation({ line }: { readonly line: WorkflowLine }) {
  const { t } = useTranslation();
  const { title, track, detail, ended } = workflowParts(t, line);

  return (
    <>
      <span
        className={cn('text-content-primary', ended === 'abandoned' && 'text-content-secondary')}
        data-spec-step
      >
        {ended ? (
          <Icon
            name={ended === 'completed' ? 'circle-check' : 'archive'}
            size="sm"
            className={cn(
              'mr-1 inline-block align-text-bottom',
              ended === 'completed' ? 'text-status-success' : 'text-content-muted',
            )}
          />
        ) : null}
        {title}
      </span>
      {track ? (
        <span className="flex min-w-0" data-spec-track>
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
        // One line under the track (the column is narrow): "Step 6 of 7 · 5 Tasks ready to start".
        <span className="text-content-secondary" data-spec-step-detail>
          {track ? <span aria-hidden="true">{track.label}</span> : null}
          {track && detail ? ' · ' : null}
          {detail}
        </span>
      ) : null}
    </>
  );
}

/** The parts of {@link WorkflowSituation}, in the Overview's own words (`workflowExecution.now`). */
export function workflowParts(
  t: TFunction,
  line: WorkflowLine,
): {
  readonly title: string;
  readonly track?: Track;
  readonly detail?: string;
  readonly ended?: 'completed' | 'abandoned';
} {
  switch (line.kind) {
    case 'not-started':
      return {
        title: t('workflowExecution.now.notStarted'),
        ...(line.stepCount && line.firstStep !== undefined
          ? {
              track: {
                position: { state: 'not-started' },
                total: line.stepCount,
                label: t('workflowExecution.now.firstStep', { title: line.firstStep }),
                ariaLabel: t('workflowExecution.now.track.notStarted', {
                  total: line.stepCount,
                  title: line.firstStep,
                }),
              },
            }
          : {}),
      };
    case 'ended':
      return {
        title: t(`workflowExecution.now.terminal.${line.outcome}`),
        ended: line.outcome,
        // The Overview's completed track; an abandoned run has none (it does not say where it stopped).
        ...(line.outcome === 'completed' && line.stepCount
          ? {
              track: {
                position: { state: 'completed' },
                total: line.stepCount,
                label: t('workflowExecution.now.track.completed', { total: line.stepCount }),
                ariaLabel: t('workflowExecution.now.track.completed', { total: line.stepCount }),
              },
            }
          : {}),
      };
    case 'step': {
      const detail = line.detail ? stepDetailText(t, line.detail) : undefined;
      const title = line.title ?? t('specifications.sections.inProgress');

      return {
        title,
        ...(line.position
          ? {
              track: {
                position: { state: 'current', step: line.position.position },
                total: line.position.total,
                label: t('workflowExecution.now.progress', line.position),
                ariaLabel: t('workflowExecution.now.track.current', {
                  ...line.position,
                  title,
                }),
              },
            }
          : {}),
        ...(detail ? { detail } : {}),
      };
    }
  }
}

function stepDetailText(
  t: TFunction,
  detail: NonNullable<Extract<WorkflowLine, { kind: 'step' }>['detail']>,
): string {
  switch (detail.kind) {
    case 'agent-working':
      return t('specifications.summary.agentWorking');
    case 'in-progress':
      return t('specifications.summary.stepInProgress');
    case 'ready':
      return t('workflowExecution.now.ready');
    case 'tasks-ready':
      return t('specifications.summary.tasksReady', { count: detail.count });
    case 'tasks-in-progress':
      return t('specifications.summary.tasksInProgress', { count: detail.count });
    case 'waiting-for':
      return t('workflowExecution.now.waitingFor', { count: detail.count, total: detail.total });
  }
}
