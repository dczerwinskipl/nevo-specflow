import { useWorkspaceLabels } from '../../app/navigation/useWorkspaceLabels';
import { useRef } from 'react';
import { createRoute } from '@tanstack/react-router';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceProvider,
  AppWorkspaceBody,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { useCachedQueryState } from '../../app/useCachedQueryState';
import {
  ApplicationLocationIdentity,
  ApplicationContextLine,
  ViewPageTitle,
} from '../../app/navigation/ApplicationLocation';
import { parseSpecificationCollection } from '../../app/router/search';
import { SpecificationAggregatePage, specificationRoute } from '../specs';

import { DocumentsView } from './views/DocumentsView';
import { DocumentContent } from './content/DocumentContent';
import { DocumentsLayout } from './workspace/DocumentsLayout';
import { documentKeys } from './queries';
/**
 * Pathless layout of the two Documents routes: the URLs stay `documents` and
 * `documents/$documentId`, but one layout instance spans them (see `DocumentsLayout`).
 */
export const documentsLayoutRoute = createRoute({
  getParentRoute: () => specificationRoute,
  id: 'documents-layout',
  component: DocumentsLayout,
});
export const documentsRoute = createRoute({
  getParentRoute: () => documentsLayoutRoute,
  path: 'documents',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: DocumentsRouteScreen,
});
export const documentDetailRoute = createRoute({
  getParentRoute: () => documentsLayoutRoute,
  path: 'documents/$documentId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: DocumentDetailRouteScreen,
});
function DocumentsRouteScreen() {
  const { specId } = documentsRoute.useParams();
  const { collection } = documentsRoute.useSearch();
  const navigate = documentsRoute.useNavigate();
  const { t } = useTranslation();
  // Demo mode is rendered by `DocumentsLayout`; this page is the other modes' Documents list.
  return (
    <SpecificationAggregatePage
      specId={specId}
      title={t('specification.documentsHeading')}
      section="documents"
    >
      {(data) => (
        <DocumentsView
          showHeading={false}
          documents={data.documents}
          onOpenDocument={(documentId) =>
            void navigate({
              to: '/specs/$specId/documents/$documentId',
              params: { specId, documentId },
              search: { collection },
              state: { specflowDocumentReturnTo: 'documents' },
            })
          }
        />
      )}
    </SpecificationAggregatePage>
  );
}
function DocumentDetailRouteScreen() {
  return (
    <AppWorkspaceProvider>
      <DocumentDetailContent />
    </AppWorkspaceProvider>
  );
}
function DocumentDetailContent() {
  const { specId, documentId } = documentDetailRoute.useParams();
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels();
  const document = useCachedQueryState<SpecificationDocumentResponse>(
    documentKeys.detail(specId, documentId),
  );
  const title =
    document?.status === 'error'
      ? t('specification.viewDocuments')
      : (document?.data?.title ?? t('specification.viewDocuments'));
  const headingRef = useRef<HTMLDivElement>(null);
  return (
    <AppWorkspace split="primary" fit="content" labels={workspaceLabels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={t('specification.viewDocuments')}
            as="span"
            identityContent={
              <ApplicationLocationIdentity
                title={t('specification.viewDocuments')}
                view="document"
                specId={specId}
                detailLabel={title}
              />
            }
          />
        }
      >
        <AppContent className="w-content-xwide max-w-full">
          <AppWorkspaceBody scroll="area" contentClassName="py-6">
            <AppContentContainer align="start" size="full">
              <div className="grid max-w-content-standard gap-6">
                <div ref={headingRef}>
                  <ApplicationContextLine specId={specId} view="document" />
                  <ViewPageTitle className="mb-0">{title}</ViewPageTitle>
                </div>
                <DocumentContent
                  specId={specId}
                  documentId={documentId}
                  omitTitle={document?.data?.title}
                  headingOffset={1}
                />
              </div>
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
export const documentsAppRoutes = [
  documentsLayoutRoute.addChildren([documentsRoute, documentDetailRoute]),
] as const;
