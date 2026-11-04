import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';

/**
 * The retained create request is in the browser but cannot be read. It may already have been
 * applied, so it is never dropped silently: starting stays blocked until the user discards it.
 */
export function UnreadableSavedStart({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation();

  return (
    <Alert tone="attention" title={t('managedSession.savedRequestUnreadable')}>
      <p>{t('managedSession.savedRequestUnreadableBody')}</p>
      <Button size="sm" onClick={onDiscard}>
        {t('managedSession.discardSavedRequest')}
      </Button>
    </Alert>
  );
}
