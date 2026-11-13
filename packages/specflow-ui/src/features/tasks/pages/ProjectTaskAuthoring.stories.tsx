import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from '@nevo/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { specificationKeys } from '../../specs/read-model';
import { ProjectTasksSection } from '../contributions/specification-work';
import { useSpecificationTask } from '../useSpecificationTask';
import { SpecificationTaskPage } from './SpecificationTaskPage';
import {
  SPEC,
  TASK,
  authoringApi,
  taskDocumentApi,
  taskResponse,
  workspaceData,
  type AuthoringScenario,
} from './ProjectTaskAuthoring.stories-support';

interface FixtureProps {
  readonly screen: 'task' | 'overview';
  readonly scenario: AuthoringScenario;
}

/**
 * Task authoring of a project Runtime through the production page and hooks; only the Runtime
 * ports are fakes (the Task, its projection, its documents and the Specification workspace).
 */
export function TaskAuthoringFixture({ screen, scenario }: FixtureProps) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    const workspace = workspaceData(scenario);
    query.setQueryDefaults(specificationKeys.detail(SPEC), { staleTime: Infinity });
    query.setQueryData(specificationKeys.detail(SPEC), workspace);
    const response = taskResponse(scenario);
    const services = createSpecFlowAppServices({
      taskApi: { getTask: () => Promise.resolve(response) },
      taskAuthoringApi: authoringApi(scenario),
      documentApi: taskDocumentApi,
    });

    return { query, services, workspace };
  }, [scenario]);

  return (
    <StoryLocalization>
      <QueryClientProvider client={setup.query}>
        <TestServicesRouterContext services={setup.services}>
          <VisitStateProvider>
            <div style={{ height: '100dvh' }}>
              <AppShell navigation={<div className="p-4">Navigation</div>}>
                {screen === 'task' ? (
                  <ConnectedTask />
                ) : (
                  // The section alone, at the width of the Overview's work column.
                  <div className="@container/work w-content-standard max-w-full p-6">
                    <ProjectTasksSection
                      specId={SPEC}
                      specTitle={setup.workspace.title}
                      taskGroups={setup.workspace.taskGroups}
                      totalTasksCount={setup.workspace.totalTasksCount}
                      completedTasksCount={setup.workspace.completedTasksCount}
                      onPreviewTask={() => undefined}
                      fullTaskHref={(id) => `/specs/${SPEC}/tasks/${id}`}
                      onExecuteTasks={() => undefined}
                      canExecute={false}
                    />
                  </div>
                )}
              </AppShell>
            </div>
          </VisitStateProvider>
        </TestServicesRouterContext>
      </QueryClientProvider>
    </StoryLocalization>
  );
}

function ConnectedTask() {
  const taskState = useSpecificationTask(SPEC, TASK);

  return (
    <SpecificationTaskPage
      specId={SPEC}
      taskId={TASK}
      collection="current"
      taskState={taskState}
      onBack={() => undefined}
    />
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
export const NarrowTask: Story = {
  tags: ['capture'],
  globals: { viewport: { value: 'mobile1' } },
};
