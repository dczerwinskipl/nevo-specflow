import { Button, Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export function ExtensionsSection() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="operations-heading" className="border-t border-border-subtle pt-6">
      <div className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-content-muted">
          <Icon name="workflow" size="sm" />
        </span>
        <Typography
          as="h2"
          variant="title-sm"
          id="operations-heading"
          className="font-semibold text-content-primary"
        >
          {t('specification.relatedOperationsHeading')}
        </Typography>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-control border border-border-subtle bg-surface-subtle p-3">
        <div>
          <div className="font-medium text-content-primary">
            {t('specification.continuousIntegration')}
          </div>
          <div className="text-body-xs text-content-muted">
            {t('specification.lastCheckPassed')}
          </div>
        </div>
        <Button size="sm" variant="secondary">
          {t('common.open')}
        </Button>
      </div>
    </section>
  );
}
