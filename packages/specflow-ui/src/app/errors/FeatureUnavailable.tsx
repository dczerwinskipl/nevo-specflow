import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@nevo/ui';

/**
 * A feature the connected Runtime does not serve (permanent, not an incident): no retry, no error
 * tone. Callers decide the surrounding page; `actions` offers a way back to what does work.
 */
export function FeatureUnavailable({
  actions,
  className,
}: {
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      role="status"
      className={className}
      title={t('featureUnavailable.title')}
      description={t('featureUnavailable.description')}
      actions={actions}
    />
  );
}
