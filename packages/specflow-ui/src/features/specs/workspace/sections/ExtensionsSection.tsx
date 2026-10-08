import { Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { WorkspaceSection } from './WorkspaceSection';

export function ExtensionsSection() {
  const { t } = useTranslation();

  return (
    <WorkspaceSection aria-labelledby="operations-heading">
      <WorkspaceSection.Header
        id="operations-heading"
        title={t('specification.relatedOperationsHeading')}
        icon="workflow"
      />

      <div className="rounded-control border border-border-subtle bg-surface-subtle p-4">
        <Typography variant="body-sm" className="text-content-muted">
          {t('specification.extensionsNotice')}
        </Typography>
      </div>
    </WorkspaceSection>
  );
}
