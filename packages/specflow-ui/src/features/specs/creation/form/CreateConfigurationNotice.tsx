import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';

/** The demo Create could not read its configuration: say so and offer to read it again. */
export function CreateConfigurationNotice({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="attention" title={t('create.configUnavailable.title')}>
      <p>{t('create.configUnavailable.body')}</p>
      <Button type="button" onClick={onRefresh}>
        {t('create.configUnavailable.refresh')}
      </Button>
    </Alert>
  );
}
