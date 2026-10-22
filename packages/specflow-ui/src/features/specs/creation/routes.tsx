import { parseSpecificationCollection } from '../../../app/router/search';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { AppWorkspaceProvider } from '@nevo/ui';
import { createRoute } from '@tanstack/react-router';
import { appRoute } from '../../../app/router/root';
import { specificationRoute } from '../routes';
import { CreateOperationScreen } from './CreateOperationScreen';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
export const createSpecificationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/new',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: NewSpecification,
});
/**
 * The page of one Create operation, the place the form hands over to: bookmarkable and safe to
 * reload, because the operation is identified by its id and the server (or the stored request)
 * says what became of it.
 */
export const createOperationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/new/creating/$operationId',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: CreatingSpecification,
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
        onProjectStarted={(operationId, { replace }) =>
          void navigate({
            to: '/specs/new/creating/$operationId',
            params: { operationId },
            search: { collection },
            replace,
          })
        }
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
function CreatingSpecification() {
  const { operationId } = createOperationRoute.useParams();
  const navigate = createOperationRoute.useNavigate();
  const collection = useApplicationCollection();
  return (
    <AppWorkspaceProvider>
      <CreateOperationScreen
        operationId={operationId}
        onOpen={(created) =>
          void navigate({
            to: '/specs/$specId',
            params: { specId: created.specId },
            search: { collection },
            replace: true,
          })
        }
        onBackToForm={() => void navigate({ to: '/specs/new', search: { collection } })}
        onBackToSpecifications={() => void navigate({ to: '/', search: { collection } })}
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
        onProjectStarted={() => undefined}
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
