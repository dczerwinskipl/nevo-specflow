import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowRouter } from '../../../app/router';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
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

export type ControlCenterPage = 'overview' | 'tasks' | 'tasks-blocking';

const never = () => new Promise<never>(() => undefined);

function services(scenario: ControlCenterScenario) {
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
    specificationApi: { getSpecificationWorkspace: () => controlCenterWorkspace(scenario) },
    taskApi: {
      getTask: never,
      getTaskList: (_specId, query) =>
        Promise.resolve(controlCenterTaskList(scenario, query.blocking === 'specification')),
    },
    taskAuthoringApi: {
      ...authoringApi('started'),
      specificationActions: () => Promise.resolve(controlCenterProjection(scenario)),
    },
    workflowExecutionApi: {
      start: never,
      finish: never,
      returnTo: never,
      abandon: never,
      closePreview: never,
      close: never,
    },
    documentApi: taskDocumentApi,
  });
}

const paths: Record<ControlCenterPage, string> = {
  overview: `/specs/${SPEC}`,
  tasks: `/specs/${SPEC}/tasks`,
  'tasks-blocking': `/specs/${SPEC}/tasks?blocking=specification`,
};

/** The routed application on the Overview or the Tasks page of one scenario. */
export function ControlCenterApp({
  scenario,
  page = 'overview',
}: {
  readonly scenario: ControlCenterScenario;
  readonly page?: ControlCenterPage;
}) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    const router = createSpecFlowRouter(
      createMemoryHistory({ initialEntries: [paths[page]] }),
      services(scenario),
    );

    return { query, router };
  }, [scenario, page]);

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
