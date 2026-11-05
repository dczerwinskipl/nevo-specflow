import { useTranslation } from 'react-i18next';
import { Skeleton, Typography } from '@nevo/ui';

/**
 * The start form while the provider catalogue loads: its heading is real, the tiles and fields are
 * placeholders in the final geometry (tile row, then Model, Effort and Work mode, then the name),
 * so the form does not jump when the catalogue arrives.
 */
export function StartFormSkeleton() {
  const { t } = useTranslation();

  return (
    <div aria-busy="true" className="@container grid gap-6">
      <Typography as="h2" variant="title-md">
        {t('sessionStart.form.title')}
      </Typography>
      <p role="status" className="sr-only">
        {t('common.loading')}
      </p>
      <div className="grid gap-1.5">
        <Typography as="p" variant="label-md">
          {t('sessionStart.agent.heading')}
        </Typography>
        <div className="grid items-stretch gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="hidden h-24 @lg:block" />
        </div>
      </div>
      <div className="grid gap-4">
        {[
          t('managedSession.model.sectionLabel'),
          t('sessionStart.fields.effort'),
          t('managedSession.intent.sectionLabel'),
        ].map((label) => (
          <div key={label} className="grid gap-1.5">
            <Typography as="p" variant="label-sm" className="text-content-muted">
              {label}
            </Typography>
            <Skeleton className="h-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
