import { Icon, cn } from '@nevo/ui';
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
    const [first, second] = workflowText(t, summary.line);

    return (
      <span className="text-content-secondary [overflow-wrap:anywhere]" data-spec-reason>
        <span>{first}</span>
        {second ? (
          <span className="block text-content-muted" data-spec-step-detail>
            {second}
          </span>
        ) : null}
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
  const position = item.workflow ? workflowText(t, item.workflow).join(' · ') : undefined;

  return (
    <span
      className={
        summary.kind === 'attention'
          ? 'text-status-attention [overflow-wrap:anywhere]'
          : 'text-content-secondary [overflow-wrap:anywhere]'
      }
      data-spec-reason
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
      <span>{text}</span>
      {position ? (
        <span className="block text-content-secondary" data-spec-step-detail>
          {position}
        </span>
      ) : item.qualifier ? (
        <span className="block text-content-secondary">
          {t('specifications.summary.concurrent', { count: item.qualifier.executionCount })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Where the workflow stands in the Overview's own words (`workflowExecution.now`): the step title,
 * then "Step N of M" with who or what it waits for. A line the row cannot fill is left out.
 */
export function workflowText(t: TFunction, line: WorkflowLine): [string] | [string, string] {
  switch (line.kind) {
    case 'not-started':
      return [t('workflowExecution.now.notStarted')];
    case 'ended':
      return [t(`workflowExecution.now.terminal.${line.outcome}`)];
    case 'step': {
      const detail = line.detail ? stepDetailText(t, line.detail) : undefined;
      const second = [
        line.position ? t('workflowExecution.now.progress', line.position) : undefined,
        detail,
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · ');
      const first = line.title ?? t('specifications.sections.inProgress');

      return second ? [first, second] : [first];
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
