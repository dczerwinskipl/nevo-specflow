import { createRoute, Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  WorkspaceHeader,
} from '@nevo/ui';
import { appRoute } from '../../app/router/root';
import { SpecificationAggregatePage } from '../specs/pages/SpecificationAggregatePage';
import { DocumentsView } from './views/DocumentsView';
import { DocumentContent } from './connected/DocumentContent';

export const documentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/documents',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: DocumentsRouteScreen,
});

export const documentDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId/documents/$documentId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  }),
  component: DocumentDetailRouteScreen,
});

function DocumentsRouteScreen() {
  const { specId } = documentsRoute.useParams();
  const { collection } = documentsRoute.useSearch();
  const navigate = documentsRoute.useNavigate();
  return (
    <SpecificationAggregatePage specId={specId} title="Documents" section="documents">
      {(data) => (
        <DocumentsView
          documents={data.documents}
          onOpenDocument={(documentId) => {
            void navigate({
              to: '/specs/$specId/documents/$documentId',
              params: { specId, documentId },
              search: { collection },
              state: { specflowDocumentReturnTo: 'documents' },
            });
          }}
        />
      )}
    </SpecificationAggregatePage>
  );
}

function DocumentDetailRouteScreen() {
  const { specId, documentId } = documentDetailRoute.useParams();
  const { collection } = documentDetailRoute.useSearch();
  const { t } = useTranslation();
  const from = useRouterState({ select: (state) => state.location.state.specflowDocumentReturnTo });
  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title={documentId} />}>
        <AppContent className="w-content-xwide max-w-full">
          <AppWorkspaceBody className="py-6">
            <AppContentContainer align="start" size="full">
              <div className="grid max-w-content-standard gap-6">
                {from === 'overview' ? (
                  <Link
                    to="/specs/$specId"
                    params={{ specId }}
                    search={{ collection }}
                    className="w-fit text-body-sm font-medium text-accent-primary"
                  >
                    {t('specification.backToSpecification')}
                  </Link>
                ) : (
                  <Link
                    to="/specs/$specId/documents"
                    params={{ specId }}
                    search={{ collection }}
                    className="w-fit text-body-sm font-medium text-accent-primary"
                  >
                    {t('specification.backToDocuments')}
                  </Link>
                )}
                <DocumentContent specId={specId} documentId={documentId} />
              </div>
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

export const documentsAppRoutes = [documentsRoute, documentDetailRoute] as const;
