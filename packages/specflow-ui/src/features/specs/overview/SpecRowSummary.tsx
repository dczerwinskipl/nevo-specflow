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
      <time dateTime={history.timestamp}>{t(`specs.history.${history.kind}`, { date })}</time>
    ) : (
      <span>{t('specs.history.archivedWithoutDate')}</span>
    );
  }
  const summary = item.summary;
  const text =
    summary.kind === 'attention'
      ? t(`specs.summary.${summary.reason}`, { count: summary.count ?? 1 })
      : summary.kind === 'active'
        ? t('specs.summary.active', { count: summary.executionCount })
        : t(`specs.summary.${summary.kind}`);
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
        <span> · {t('specs.summary.concurrent', { count: item.qualifier.executionCount })}</span>
      ) : null}
    </span>
  );
}
