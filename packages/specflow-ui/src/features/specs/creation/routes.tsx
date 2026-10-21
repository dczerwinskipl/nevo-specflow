import { parseSpecificationCollection } from '../../../app/router/search';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { AppWorkspaceProvider } from '@nevo/ui';
import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../../app/router/root';
import { specificationRoute } from '../routes';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
export const createSpecificationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/new',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: NewSpecification,
});
export const newSessionRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: 'sessions/new',
  component: NewSession,
});
function NewSpecification() {
  const navigate = createSpecificationRoute.useNavigate();
  const collection = useApplicationCollection();
  return (
    <AppWorkspaceProvider>
      <CreateSpecificationScreen
        onBack={() => void navigate({ to: '/', search: { collection } })}
        onCreated={(specId, documentId) => {
          if (documentId)
            void navigate({
              to: '/specs/$specId/documents/$documentId',
              params: { specId, documentId },
              search: { collection },
            });
          else
            void navigate({
              to: '/specs/$specId/documents',
              params: { specId },
              search: { collection },
            });
        }}
        onSession={(specId, sessionId) =>
          void navigate({
            to: '/specs/$specId/sessions/$sessionId',
            params: { specId, sessionId },
            search: { collection },
          })
        }
      />
    </AppWorkspaceProvider>
  );
}
function NewSession() {
  const { specId } = newSessionRoute.useParams();
  const navigate = newSessionRoute.useNavigate();
  const { collection } = newSessionRoute.useSearch();
  return (
    <AppWorkspaceProvider>
      <CreateSpecificationScreen
        specId={specId}
        onBack={() =>
          void navigate({
            to: '/specs/$specId/sessions',
            params: { specId },
            search: { collection },
          })
        }
        onCreated={() => {
          void navigate({ to: '/specs/$specId', params: { specId }, search: { collection } });
        }}
        onSession={(id, sessionId) =>
          void navigate({
            to: '/specs/$specId/sessions/$sessionId',
            params: { specId: id, sessionId },
            search: { collection },
          })
        }
      />
    </AppWorkspaceProvider>
  );
}
