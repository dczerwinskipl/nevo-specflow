import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoutedSpecificationApp, type ControlCenterPage } from './ControlCenterApp.stories-support';
import {
  earlyDocumentApi,
  earlyProjection,
  earlyTaskList,
  earlyWorkspace,
  type EarlyScenario,
} from './overviewEarly.stories-support';

/** The routed application in one early state of the Specification (faked Runtime ports only). */
function EarlyOverviewApp({
  scenario,
  page = 'overview',
}: {
  readonly scenario: EarlyScenario;
  readonly page?: ControlCenterPage;
}) {
  const source = useMemo(
    () => ({
      workspace: () => earlyWorkspace(scenario),
      projection: () => earlyProjection(scenario),
      taskList: () => earlyTaskList(scenario),
      documents: earlyDocumentApi,
    }),
    [scenario],
  );

  return <RoutedSpecificationApp source={source} page={page} />;
}

/**
 * The Specification Overview in its early states (accepted variant E): no Requires attention
 * without items; Tasks, Sessions and Documents always in their place, each with an inline empty
 * state while empty; Now with the step's purpose and its position in the workflow.
 */
const meta = {
  title: 'SpecFlow/Screens/Specification Overview early states',
  component: EarlyOverviewApp,
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'write-spec', page: 'overview' },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['not-started', 'write-spec', 'write-spec-session', 'tasks-created'],
    },
    page: { control: 'inline-radio', options: ['overview', 'tasks'] },
  },
} satisfies Meta<typeof EarlyOverviewApp>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Just created: Start workflow, "First step · â€¦", every section with its empty state. */
export const NotStarted: Story = {
  tags: ['contract'],
  args: { scenario: 'not-started' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Start workflow' })).toBeVisible();
    await expect(canvas.getByText('First step · Gather requirements')).toBeVisible();
    await expect(canvas.queryByText('Requires attention')).toBeNull();
    await expect(canvas.getByText('No tasks yet')).toBeVisible();
    await expect(
      canvas.getByText(
        'Tasks appear when the workflow reaches Break the solution down (step 4 of 7).',
      ),
    ).toBeVisible();
    await expect(canvas.getByText('This specification has no sessions yet.')).toBeVisible();
    // New session is the Sessions section's own action, never beside Start workflow.
    const newSession = canvas.getByRole('button', { name: 'New session' });
    await expect(newSession.closest('[data-workflow-now]')).toBeNull();
    await expect(canvas.getAllByText('Template only')).toHaveLength(5);
  },
};

/** Writing the Specification by hand: "Step 2 of 7 · next: â€¦", two documents still templates. */
export const WriteSpec: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Finish step' })).toBeVisible();
    await expect(canvas.getByText('Step 2 of 7 · next: Design the solution')).toBeVisible();
    await expect(
      canvas.getByText('Write the Specification documents from the agreed requirements.'),
    ).toBeVisible();
    await expect(canvas.getAllByText('Template only')).toHaveLength(2);
  },
};

/** With the one Session working on the Specification. */
export const WithSession: Story = {
  tags: ['contract'],
  args: { scenario: 'write-spec-session' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Write the cutoff Specification documents' }),
    ).toBeVisible();
    await expect(canvas.queryByText('This specification has no sessions yet.')).toBeNull();
  },
};

/** The breakdown created the first drafts: the Tasks section fills in its place. */
export const TasksCreated: Story = {
  tags: ['contract'],
  args: { scenario: 'tasks-created' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('link', { name: 'Needs approval: open on the Tasks page' }),
    ).toBeVisible();
    await expect(canvas.queryByText('No tasks yet')).toBeNull();
    await expect(canvas.getByText('Step 4 of 7 · next: Review the breakdown')).toBeVisible();
  },
};

/** The overview document open beside the Overview. */
export const DocumentOpen: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^overview\.md/ }));
    await expect(await canvas.findByText('Source: GitHub issue #156.')).toBeInTheDocument();
  },
};

/** The empty Tasks page names the same step as the Overview. */
export const TasksPageEmpty: Story = {
  tags: ['contract'],
  args: { scenario: 'not-started', page: 'tasks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Tasks appear when the workflow reaches Break the solution down (step 4 of 7).',
      ),
    ).toBeVisible();
  },
};
