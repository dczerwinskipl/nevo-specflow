import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';

/** The configuration could not be read (again): say so and offer to read it again. */
export function ConfigurationNotice({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation();

  return (
    <Alert tone="attention" title={t('create.configUnavailable.title')}>
      <p>{t('sessionStart.form.configurationBody')}</p>
      <Button type="button" onClick={onRefresh}>
        {t('create.configUnavailable.refresh')}
      </Button>
    </Alert>
  );
}
