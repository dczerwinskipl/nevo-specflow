import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';

/** Where a new Session of an existing specification will run (the workspace is not chosen here). */
export function SessionWorkspaceSummary({
  location,
}: {
  location: DemoCatalogue['currentLocation'];
}) {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section className="grid gap-4" aria-labelledby={headingId}>
      <div className="grid gap-1">
        <Typography as="h2" variant="title-md" id={headingId}>
          {t('create.workspace.heading')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('create.sessionWorkspaceIntro')}
        </Typography>
      </div>
      <p className="break-all text-body-sm text-content-secondary">
        {location.path} · {location.branch}
        {location.simulated ? ` · ${t('create.simulatedSuffix')}` : ''}
      </p>
    </section>
  );
}
