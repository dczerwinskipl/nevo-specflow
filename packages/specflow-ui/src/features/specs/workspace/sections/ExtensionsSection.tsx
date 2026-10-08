import { Icon, Typography } from '@nevo/ui';
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

      <div className="mt-3 rounded-control border border-border-subtle bg-surface-subtle p-4">
        <Typography variant="body-sm" className="text-content-muted">
          {t('specification.extensionsNotice')}
        </Typography>
      </div>
    </section>
  );
}
