import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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
import {
  SPEC,
  TASK,
  authoringApi,
  taskDocumentApi,
  taskResponse,
  workspaceResponse,
  type AuthoringScenario,
} from './ProjectTaskAuthoring.stories-support';

interface FixtureProps {
  readonly screen: 'task' | 'overview';
  readonly scenario: AuthoringScenario;
}

/**
 * Task authoring of a project Runtime in the routed application (shell, navigation, Specification
 * Overview and Full Task routes); only the Runtime ports are fakes.
 */
export function TaskAuthoringFixture({ screen, scenario }: FixtureProps) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    const defaults = createSpecFlowAppServices();
    const services = createSpecFlowAppServices({
      authStore: createAuthStore(defaults.authApi, {
        authenticationRequired: false,
        authenticated: false,
        user: { id: 'story', name: 'Demo' },
        loginMethods: { password: { enabled: false }, oidc: [] },
      }),
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
      specsOverviewApi: createFixtureSpecsOverviewApi(),
      specificationApi: { getSpecificationWorkspace: () => workspaceResponse(scenario) },
      taskApi: { getTask: () => Promise.resolve(taskResponse(scenario)) },
      taskAuthoringApi: authoringApi(scenario),
      documentApi: taskDocumentApi,
    });
    const path = screen === 'task' ? `/specs/${SPEC}/tasks/${TASK}` : `/specs/${SPEC}`;
    const router = createSpecFlowRouter(createMemoryHistory({ initialEntries: [path] }), services);

    return { query, router };
  }, [screen, scenario]);

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

const meta = {
  title: 'SpecFlow/Screens/Task authoring',
  component: TaskAuthoringFixture,
  excludeStories: ['TaskAuthoringFixture'],
  parameters: { layout: 'fullscreen' },
  args: { screen: 'task', scenario: 'draft-problems' },
  argTypes: {
    screen: { control: 'inline-radio', options: ['task', 'overview'] },
    scenario: {
      control: 'select',
      options: ['draft-problems', 'started', 'empty-specification'],
    },
  },
} satisfies Meta<typeof TaskAuthoringFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const StartedTask: Story = { tags: ['capture'], args: { scenario: 'started' } };
export const OverviewTasks: Story = { tags: ['capture'], args: { screen: 'overview' } };
export const OverviewEmpty: Story = {
  tags: ['capture'],
  args: { screen: 'overview', scenario: 'empty-specification' },
};
