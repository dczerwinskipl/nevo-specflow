import { Icon } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export function RefreshStatus({ active }: { readonly active: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center"
      role="status"
      aria-label={active ? t('specifications.refreshing') : undefined}
    >
      {active ? <Icon name="refresh" size="sm" aria-hidden="true" /> : null}
    </span>
  );
}
