import { Fragment, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createRoute, Link, Outlet, redirect, useRouter } from '@tanstack/react-router';
import { appRoute, rootRoute } from '../../app/router/root';
import { parseSpecificationCollection } from '../../app/router/search';
import { SpecsOverview } from './overview/SpecsOverview';
import { useUiModules } from '../../app/ui-modules/UiModulesProvider';
import { specsOverviewPanels } from './extensions/specsOverviewPanels';
import { useSpecificationWorkspace } from './read-model/useSpecificationWorkspace';
import { useRuntimeMode } from '../../app/useRuntimeMode';
import { useSpecsOverview } from './overview/data/useSpecsOverview';
import { SpecsAccessDenied } from './overview/SpecsAccessDenied';
import { SpecificationSurface } from './SpecificationSurface';
import { specPrimaryLinkClassName } from './overview/rows/SpecPrimaryLink';
import type { TaskSection } from './workspace/WorkspaceContext';
import { documentCatalogueKeys } from '../documents/read-model';
import { archetypeAvailabilityProblem } from './archetypeAvailability';
import { message } from '../../i18n/message';
import { isApiError } from '../../api';

export const specsForbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/access-denied',
  component: SpecsAccessDenied,
});

export const specsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    collection: parseSpecificationCollection(search),
  }),
  component: SpecsRouteScreen,
});

type LegacySpecificationView =
  'work' | 'documents' | 'sessions' | 'changes' | 'repository' | 'task';

const VALID_VIEWS: ReadonlySet<LegacySpecificationView> = new Set([
  'work',
  'documents',
  'sessions',
  'changes',
  'repository',
  'task',
]);

function isValidView(view: unknown): view is LegacySpecificationView {
  return typeof view === 'string' && VALID_VIEWS.has(view as LegacySpecificationView);
}

export function validateSpecificationSearch(search: Record<string, unknown>): {
  collection: 'current' | 'archive';
  view?: LegacySpecificationView;
  task?: string;
} {
  const collection = parseSpecificationCollection(search);
  const rawView = isValidView(search.view) ? search.view : undefined;
  const rawTask =
    typeof search.task === 'string' && search.task.trim().length > 0
      ? search.task.trim()
      : undefined;

  let view: LegacySpecificationView | undefined;
  let task: string | undefined;

  if (rawView === 'task') {
    view = 'task';
    task = rawTask;
  } else if (rawView) {
    view = rawView;
  } else if (rawTask) {
    view = 'task';
    task = rawTask;
  }

  return {
    collection,
    ...(view ? { view } : {}),
    ...(task ? { task } : {}),
  };
}

export const specificationRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/specs/$specId',
  validateSearch: validateSpecificationSearch,
  beforeLoad: ({ params, search }) => {
    // Normalize old tab-like URLs to canonical Primary resources.
    if (search.view === 'task') {
      if (search.task) {
        return redirect({
          to: '/specs/$specId/tasks/$taskId',
          params: { specId: params.specId, taskId: search.task },
          search: { collection: search.collection },
          replace: true,
        });
      }

      return redirect({
        to: '/specs/$specId',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }

    if (search.view === 'work') {
      return redirect({
        to: '/specs/$specId',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }

    if (search.view === 'documents') {
      return redirect({
        to: '/specs/$specId/documents',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }

    if (search.view === 'sessions') {
      return redirect({
        to: '/specs/$specId/sessions',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }

    if (search.view === 'changes') {
      return redirect({
        to: '/specs/$specId/changes',
        params: { specId: params.specId },
        search: { collection: search.collection, source: 'base' },
        replace: true,
      });
    }

    if (search.view === 'repository') {
      return redirect({
        to: '/specs/$specId/repository',
        params: { specId: params.specId },
        search: { collection: search.collection },
        replace: true,
      });
    }
  },
  component: SpecificationRouteLayout,
});

/**
 * The Specification route owns the Workspace query for every per-spec child route. Children
 * and the navigation observe the same entry, so a cold deep link and client navigation read
 * one deterministic source (deduplicated with the Overview/Documents/Sessions reads).
 */
function SpecificationRouteLayout() {
  const { specId } = specificationRoute.useParams();
  useSpecificationWorkspace(specId);

  return <Outlet />;
}

export const specificationIndexRoute = createRoute({
  getParentRoute: () => specificationRoute,
  path: '/',
  component: SpecificationRouteScreen,
});

function SpecsRouteScreen() {
  const { services } = specsRoute.useRouteContext();
  const mode = useRuntimeMode();
  const { collection } = specsRoute.useSearch();
  const navigate = specsRoute.useNavigate();
  const { state, refresh } = useSpecsOverview(services.specsOverviewApi, collection);
  const panels = useUiModules().get(specsOverviewPanels);
  const firstRun =
    mode === 'project' && collection === 'current' && state.projection?.items.length === 0;
  const catalogue = useQuery({
    queryKey: documentCatalogueKeys.catalogue('project'),
    queryFn: ({ signal }) => services.projectCreationApi.archetypes(signal),
    enabled: firstRun,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const creationPrerequisite = !firstRun
    ? undefined
    : catalogue.isPending
      ? message('create.archetype.loading')
      : catalogue.isError
        ? message(
            isApiError(catalogue.error) && catalogue.error.kind === 'forbidden'
              ? 'create.prerequisite.forbidden'
              : 'create.archetype.loadFailed',
          )
        : archetypeAvailabilityProblem(catalogue.data);

  useEffect(() => {
    // Overview authorization denotes application-wide Specs access, unlike
    // a forbidden individual Task or Document resource.
    if (state.accessDenied) {
      void navigate({ to: '/access-denied', replace: true });
    }
  }, [state.accessDenied, navigate]);

  if (state.accessDenied) {
    return null;
  }

  return (
    <SpecsOverview
      state={state}
      onRefresh={refresh}
      sample={mode === 'demo'}
      operationsPanel={panels.map((panel) => (
        <Fragment key={panel.id}>
          {panel.render({ collection, mode, operationsApi: services.operationsApi })}
        </Fragment>
      ))}
      onCreate={() => void navigate({ to: '/specs/new', search: { collection } })}
      // Create waits for the Runtime mode (it picks the flow); the control stays, disabled.
      createDisabled={mode === 'loading' || mode === 'unavailable'}
      creationPrerequisite={creationPrerequisite}
      creationRefreshing={catalogue.isFetching}
      onRefreshCreation={() => void catalogue.refetch()}
      onCollectionChange={(value) => void navigate({ search: { collection: value } })}
      specificationHref={(specId) =>
        `/specs/${encodeURIComponent(specId)}?collection=${collection}`
      }
      renderSpecificationLink={(specId, children, ariaLabel) => (
        <Link
          to="/specs/$specId"
          params={{ specId }}
          search={{ collection }}
          className={specPrimaryLinkClassName}
          aria-label={ariaLabel}
          data-focus-ring="delegated"
        >
          {children}
        </Link>
      )}
      onOpenTarget={(target) =>
        void navigate({
          to: '/specs/$specId',
          params: { specId: target.specId },
          search: { collection },
        })
      }
    />
  );
}

/** The Full Task section heading a Requires attention action lands on. */
const TASK_SECTION_HEADINGS: Readonly<Record<TaskSection, string>> = {
  context: 'task-context-heading',
  dependencies: 'task-dependencies-heading',
};

function SpecificationRouteScreen() {
  const { specId } = specificationRoute.useParams();
  const { collection } = specificationRoute.useSearch();
  const navigate = specificationRoute.useNavigate();
  const router = useRouter();

  return (
    <SpecificationSurface
      specId={specId}
      collection={collection}

      onOpenTask={(taskId, section) => {
        void navigate({
          to: '/specs/$specId/tasks/$taskId',
          params: { specId, taskId },
          search: { collection },
          ...(section ? { hash: TASK_SECTION_HEADINGS[section] } : {}),
        });
      }}
      onOpenTasks={(target) =>
        void navigate({
          to: '/specs/$specId/tasks',
          params: { specId },
          search: { collection, ...target },
        })
      }
      onOpenFullDocument={(documentId) => {
        void navigate({
          to: '/specs/$specId/documents/$documentId',
          params: { specId, documentId },
          search: { collection },
          state: {
            specflowDocumentReturnTo: 'overview',
            specflowDocumentReturnIndex: router.state.location.state.__TSR_index,
          },
        });
      }}
      onOpenDocuments={() =>
        void navigate({
          to: '/specs/$specId/documents',
          params: { specId },
          search: { collection },
        })
      }
      onOpenSession={
        // Full Session is canonical at the top-level `/sessions/:sessionId` route (real feed/API,
        // ManagedSession) regardless of Runtime mode; the nested `/specs/:specId/sessions/:sessionId`
        // placeholder now only redirects there for old links (see sessionDetailRoute).
        (sessionId) =>
          void navigate({
            to: '/sessions/$sessionId',
            params: { sessionId },
            search: { collection },
          })
      }
      onOpenSessions={() =>
        void navigate({ to: '/specs/$specId/sessions', params: { specId }, search: { collection } })
      }
      onNewSession={() =>
        void navigate({
          to: '/specs/$specId/sessions/new',
          params: { specId },
          search: { collection },
        })
      }
      onOpenRepository={() =>
        void navigate({
          to: '/specs/$specId/repository',
          params: { specId },
          search: { collection },
        })
      }
      onOpenChanges={(source = 'base') =>
        void navigate({
          to: '/specs/$specId/changes',
          params: { specId },
          search: { collection, source },
        })
      }
    />
  );
}

export const specsAppRoutes = [specsRoute] as const;
export const specsRootRoutes = [specsForbiddenRoute] as const;
