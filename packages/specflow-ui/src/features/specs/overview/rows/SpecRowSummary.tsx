import { Icon, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { collectionWide } from '../../../../shared/operational-list';
import { SpecificationSituation } from '../../../tasks';
import type { SpecRowModel } from '../presentation';
import { formatSpecDate } from './specDate';
import { productIcons } from '../../../../shared/product-icons';

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
    // The Overview's own components and words for where the workflow stands (`SpecificationNow`).
    return (
      <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]" data-spec-reason>
        <SpecificationSituation
          workflow={summary.workflow}
          {...(summary.attention ? { attention: summary.attention } : {})}
        />
      </span>
    );
  }

  if (summary.kind === 'unreadable') {
    return (
      <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]" data-spec-reason>
        <span className="font-medium text-status-danger" data-spec-unreadable={summary.reason}>
          <Icon name="circle-alert" size="sm" className="mr-1 inline-block align-text-bottom" />
          {t('specifications.unreadable.title')}
        </span>
        <span className="text-content-secondary">
          {t(`specifications.unreadable.reason.${summary.reason}`)}
        </span>
      </span>
    );
  }

  // Evidence that is not the workflow's (the demo's Sessions): its signal, then the step.
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
                  ? productIcons.review
                  : productIcons.session.item
            }
            size="sm"
            className="mr-1 inline-block align-text-bottom"
          />
        ) : null}
        {text}
      </span>
      {item.workflow ? (
        <SpecificationSituation workflow={item.workflow} />
      ) : item.qualifier ? (
        <span className="text-content-secondary">
          {t('specifications.summary.concurrent', { count: item.qualifier.executionCount })}
        </span>
      ) : null}
    </span>
  );
}
