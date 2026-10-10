import type { ReactNode } from 'react';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  Spinner,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useSpecificationWorkspace } from '../useSpecificationWorkspace';
import type { SpecificationSectionId, SpecificationWorkspaceData } from '../workspace/model';

/**
 * Temporary aggregate adapter for routed feature lists that do not yet have
 * independent Runtime list endpoints. Never use this for a resource Detail page.
 */
export function SpecificationAggregatePage({
  specId,
  title,
  section,
  children,
}: {
  specId: string;
  title: string;
  section?: SpecificationSectionId;
  children: (data: SpecificationWorkspaceData) => ReactNode;
}) {
  const { t } = useTranslation();
  const query = useSpecificationWorkspace(specId);
  const availability = section && query.data?.sectionAvailability?.[section];
  const accessDenied = query.errorStatus === 403;
  const sectionDenied = availability === 'forbidden';
  const deniedCopy = {
    title: t('specification.resourceAccessDeniedTitle'),
    message: t('specification.resourceAccessDeniedDescription'),
  };
  const unavailableCopy = {
    title: t('specification.unavailableTitle'),
    message: t('specification.unavailableDescription', { id: specId }),
  };
  const errorCopy = accessDenied ? deniedCopy : unavailableCopy;
  const sectionCopy = sectionDenied ? deniedCopy : unavailableCopy;
  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title={title} />}>
        <AppContent className="w-content-xwide max-w-full">
          <AppWorkspaceBody className="py-6">
            <AppContentContainer align="start" size="full">
              {query.isPending ? (
                <Spinner label={t('specification.loadingWorkspace', { id: specId })} />
              ) : query.isError && (!query.data || query.errorStatus === 403) ? (
                <Alert role="alert" tone="attention" title={errorCopy.title}>
                  <Typography variant="body-sm">{errorCopy.message}</Typography>
                  <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              ) : availability && availability !== 'available' ? (
                <Alert role="status" tone="attention" title={sectionCopy.title}>
                  {sectionCopy.message}
                </Alert>
              ) : query.data ? (
                children(query.data)
              ) : null}
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
