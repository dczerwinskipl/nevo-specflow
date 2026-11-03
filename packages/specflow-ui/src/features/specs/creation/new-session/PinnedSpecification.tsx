import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Icon, Typography } from '@nevo/ui';
import { useSpecificationNavigationSource } from '../../overview/useSpecificationNavigationMetadata';

/**
 * The context the new Session is pinned to: the Specification it was started from, read-only. It is
 * not a choice here (no other context can be pinned yet), only what the agent will work on.
 */
export function PinnedSpecification({ specId }: { specId: string }) {
  const { t } = useTranslation();
  const headingId = useId();
  const source = useSpecificationNavigationSource(specId);
  const title =
    source.status === 'available'
      ? source.metadata.title
      : source.status === 'loading'
        ? t('common.loading')
        : specId;

  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <div className="grid gap-1">
        <Typography as="h2" variant="title-md" id={headingId}>
          {t('sessionStart.context.heading')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('sessionStart.context.intro')}
        </Typography>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Icon name="file" size="md" className="shrink-0 text-content-secondary" />
        <div className="grid min-w-0 flex-1">
          <Typography as="span" variant="label-md" className="break-words">
            {title}
          </Typography>
          <Typography as="span" variant="body-sm" className="text-content-secondary">
            {source.status === 'available' && source.metadata.key
              ? `${t('sessionStart.context.kind')} · ${source.metadata.key}`
              : t('sessionStart.context.kind')}
          </Typography>
        </div>
        <Badge>{t('sessionStart.context.pinned')}</Badge>
      </div>
    </section>
  );
}
