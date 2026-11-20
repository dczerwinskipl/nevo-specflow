import { useTranslation } from 'react-i18next';
import { Skeleton, Typography } from '@nevo/ui';

/**
 * The start form while the provider catalogue loads: placeholders in the final geometry (the row of
 * 72 px agent cards, then Model, Effort and Work mode in one row, stacked on a narrow form, then
 * the name), so the form does not jump when the catalogue arrives.
 */
export function StartFormSkeleton() {
  const { t } = useTranslation();

  return (
    <div aria-busy="true" className="@container grid gap-6">
      <p role="status" className="sr-only">
        {t('common.loading')}
      </p>
      <div className="grid gap-1.5">
        <Typography as="p" variant="label-md">
          {t('sessionStart.agent.heading')}
        </Typography>
        <div className="grid items-stretch gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
          <Skeleton className="h-[4.5rem]" />
          <Skeleton className="h-[4.5rem]" />
          <Skeleton className="hidden h-[4.5rem] @lg:block" />
        </div>
      </div>
      <div className="grid gap-4 @xl:flex @xl:gap-x-3">
        {[
          t('managedSession.model.sectionLabel'),
          t('sessionStart.fields.effort'),
          t('managedSession.intent.sectionLabel'),
        ].map((label) => (
          <div key={label} className="grid gap-1.5 @xl:flex-1">
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
