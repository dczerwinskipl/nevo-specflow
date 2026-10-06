import { Icon } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecRowModel } from './presentation';

export function SpecRowSummary({ item }: { readonly item: SpecRowModel }) {
  const { t, i18n } = useTranslation();
  if (item.collection === 'archive') {
    const history = item.history;
    const date = history.timestamp
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(history.timestamp))
      : undefined;
    return history.timestamp ? (
      <time dateTime={history.timestamp}>
        {t(`specifications.history.${history.kind}`, { date })}
      </time>
    ) : (
      <span>{t('specifications.history.archivedWithoutDate')}</span>
    );
  }
  const summary = item.summary;
  const text =
    summary.kind === 'attention'
      ? t(
          summary.reason
            ? `specifications.summary.${summary.reason}`
            : 'specifications.summary.attention',
          {
            count: summary.count ?? 1,
          },
        )
      : summary.kind === 'active'
        ? t('specifications.summary.active', { count: summary.executionCount })
        : t(`specifications.summary.${summary.kind}`);
  return (
    <span className="text-content-secondary [overflow-wrap:anywhere]" data-spec-reason>
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
      {item.qualifier ? (
        <span>
          {' '}
          · {t('specifications.summary.concurrent', { count: item.qualifier.executionCount })}
        </span>
      ) : null}
    </span>
  );
}
