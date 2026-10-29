import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from '@nevo/ui';

/**
 * A feature the connected server does not provide (permanent, not an incident): no retry, no error
 * tone. A full page offers a way back to what does work: `onBack` renders the standard "Go back"
 * action, `actions` replaces it. A panel inside a page that keeps its own navigation passes neither.
 */
export function FeatureUnavailable({
  actions,
  onBack,
  className,
}: {
  readonly actions?: ReactNode;
  /** Leaves this dead end (the page the owner came from). */
  readonly onBack?: () => void;
  readonly className?: string;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      role="status"
      className={className}
      title={t('featureUnavailable.title')}
      description={t('featureUnavailable.description')}
      actions={
        actions ??
        (onBack ? (
          <Button variant="secondary" onClick={onBack}>
            {t('featureUnavailable.back')}
          </Button>
        ) : undefined)
      }
    />
  );
}
