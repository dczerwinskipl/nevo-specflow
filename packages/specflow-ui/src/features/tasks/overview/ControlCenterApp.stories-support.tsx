import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type {
  SpecificationWorkspaceResponse,
  TaskListQuery,
  TaskListResponse,
} from '@nevo/specflow-contracts/specs/workspace';
import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowRouter } from '../../../app/router';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import type { DocumentApi } from '../../documents/api';
import { SPEC } from '../execution/projections.stories-support';
import { authoringApi, taskDocumentApi } from '../pages/ProjectTaskAuthoring.stories-support';
import {
  controlCenterProjection,
  controlCenterTaskList,
  controlCenterWorkspace,
  type ControlCenterScenario,
} from './controlCenter.stories-support';

/*
 * The Specification control center of a project Runtime in the routed application (shell,
 * navigator, Overview and Tasks page routes); only the Runtime ports are fakes.
 */

export type ControlCenterPage = 'overview' | 'tasks' | 'tasks-blocking' | 'tasks-waiting';

/** What the faked Runtime answers: the workspace read, the projection and the Tasks page read. */
export interface ControlCenterSource {
  readonly workspace: () => Promise<SpecificationWorkspaceResponse>;
  readonly projection: () => WorkflowActionProjection;
  readonly taskList: (query: TaskListQuery) => TaskListResponse;
  readonly documents?: DocumentApi;
  /** The document type catalogue (type titles and icons of the rows). */
  readonly catalogue?: ArchetypeCatalogue;
}

const never = () => new Promise<never>(() => undefined);

function scenarioSource(scenario: ControlCenterScenario): ControlCenterSource {
  return {
    workspace: () => controlCenterWorkspace(scenario),
    projection: () => controlCenterProjection(scenario),
    taskList: (query) => controlCenterTaskList(scenario, query),
  };
}

function services(source: ControlCenterSource) {
  const defaults = createSpecFlowAppServices();

  return createSpecFlowAppServices({
    authStore: createAuthStore(defaults.authApi, {
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'story', name: 'Demo' },
      loginMethods: { password: { enabled: false }, oidc: [] },
    }),
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
    specsOverviewApi: createFixtureSpecsOverviewApi(),
    specificationApi: { getSpecificationWorkspace: source.workspace },
    taskApi: {
      getTask: never,
      getTaskList: (_specId, query) => Promise.resolve(source.taskList(query)),
    },
    taskAuthoringApi: {
      ...authoringApi('started'),
      specificationActions: () => Promise.resolve(source.projection()),
    },
    workflowExecutionApi: {
      start: never,
      finish: never,
      returnTo: never,
      reevaluateWait: never,
      abandon: never,
      checkAgentExecution: never,
      startAgentExecution: never,
      closePreview: never,
      stopAgentExecution: never,
      retryAttemptCommit: never,
      confirmResult: never,
      takeOverAgentExecution: never,
      history: never,
      rejectResult: never,
      closeOccupancy: never,
      close: never,
    },
    documentApi: source.documents ?? taskDocumentApi,
    ...(source.catalogue
      ? {
          projectDocumentsApi: {
            ...defaults.projectDocumentsApi,
            catalogue: () => Promise.resolve(source.catalogue!),
          },
        }
      : {}),
  });
}

const paths: Record<ControlCenterPage, string> = {
  overview: `/specs/${SPEC}`,
  tasks: `/specs/${SPEC}/tasks`,
  'tasks-blocking': `/specs/${SPEC}/tasks?blocking=specification`,
  'tasks-waiting': `/specs/${SPEC}/tasks?group=waiting`,
};

/** The routed application on the Overview or the Tasks page of one scenario. */
export function ControlCenterApp({
  scenario,
  page = 'overview',
}: {
  readonly scenario: ControlCenterScenario;
  readonly page?: ControlCenterPage;
}) {
  const source = useMemo(() => scenarioSource(scenario), [scenario]);

  return <RoutedSpecificationApp source={source} page={page} />;
}

/** The routed application on the Overview or the Tasks page, over a faked Runtime source. */
export function RoutedSpecificationApp({
  source,
  page = 'overview',
}: {
  readonly source: ControlCenterSource;
  readonly page?: ControlCenterPage;
}) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    const router = createSpecFlowRouter(
      createMemoryHistory({ initialEntries: [paths[page]] }),
      services(source),
    );

    return { query, router };
  }, [source, page]);

  return (
    <QueryClientProvider client={setup.query}>
      <UiModulesProvider modules={builtInUiModuleRegistry}>
        <StoryLocalization locale="en">
          <RouterProvider router={setup.router} />
        </StoryLocalization>
      </UiModulesProvider>
    </QueryClientProvider>
  );
}
