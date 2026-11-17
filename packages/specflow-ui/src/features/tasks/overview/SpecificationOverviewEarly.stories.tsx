import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RoutedSpecificationApp, type ControlCenterPage } from './ControlCenterApp.stories-support';
import {
  earlyCatalogue,
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
      catalogue: earlyCatalogue,
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
      options: [
        'not-started',
        'not-started-bare',
        'write-spec',
        'write-spec-retry',
        'write-spec-gate',
        'write-spec-session',
        'breakdown',
        'tasks-created',
        'waiting',
        'completed',
      ],
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
      canvas.getByText('Tasks appear when Break the solution down (step 4 of 7) finishes.'),
    ).toBeVisible();
    await expect(canvas.getByText('This specification has no sessions yet.')).toBeVisible();
    // New session is the Sessions section's own action, never beside Start workflow.
    const newSession = canvas.getByRole('button', { name: 'New session' });
    await expect(newSession.closest('[data-workflow-now]')).toBeNull();
    await expect(canvas.getAllByText('Template only')).toHaveLength(5);
  },
};

/**
 * A real project just created, without a written goal and with Sessions turned off (audit finding
 * 14): no goal under the title, no New session.
 */
export const NotStartedBare: Story = {
  tags: ['contract'],
  args: { scenario: 'not-started-bare' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Start workflow' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'New session' })).toBeNull();
    await expect(
      canvas.getByRole('img', { name: 'Not started, 7 steps. First step: Gather requirements' }),
    ).toBeVisible();
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
      canvas.getByRole('img', { name: 'Step 2 of 7: Write the Specification' }),
    ).toBeVisible();
    await expect(
      canvas.getByText('Write the Specification documents from the agreed requirements.'),
    ).toBeVisible();
    // A first attempt is not named; the step id and revision are in the ⋯ note only.
    const now = canvas.getByRole('region', { name: 'Now' });
    await expect(now).not.toHaveTextContent(/Attempt|rev 1/);
    await expect(within(now).getByText(/^In progress since .+ · started by you$/)).toBeVisible();
    await expect(canvas.getAllByText('Template only')).toHaveLength(2);
  },
};

/** The second attempt of a step (after a return) names its attempt. */
export const WriteSpecRetry: Story = {
  tags: ['contract'],
  args: { scenario: 'write-spec-retry' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/^Attempt 2 · in progress since /)).toBeVisible();
  },
};

/**
 * An exit gate names a document: opening it is the main action, Finish step stays beside it, and
 * the line above says what is missing.
 */
export const WriteSpecGate: Story = {
  tags: ['contract'],
  args: { scenario: 'write-spec-gate' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = await canvas.findByRole('button', { name: 'Open behaviour.md' });
    const actions = open.closest<HTMLElement>('[data-slot="workflow-actions"]')!;
    await expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Open behaviour.md', 'Finish step']);
    await expect(
      canvas.getByText('Add the Acceptance section to behaviour.md to finish.'),
    ).toBeVisible();
  },
};

/** Break the solution down before any Task exists: New task is the one secondary action. */
export const Breakdown: Story = {
  tags: ['contract'],
  args: { scenario: 'breakdown' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const finish = await canvas.findByRole('button', { name: 'Finish step' });
    const actions = finish.closest<HTMLElement>('[data-slot="workflow-actions"]')!;
    await expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Finish step', 'New task']);
    await expect(
      canvas.getByRole('img', { name: 'Step 4 of 7: Break the solution down' }),
    ).toBeVisible();
    await userEvent.click(within(actions).getByRole('button', { name: 'New task' }));
    // The dialog is portalled to the document body.
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'New task' }),
    ).toBeVisible();
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

/** The wait step: the step track is compact; the Task progress is the dominant one. */
export const Waiting: Story = {
  tags: ['contract'],
  args: { scenario: 'waiting' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const track = await canvas.findByRole('img', { name: 'Step 6 of 7: Implement' });
    await expect(track).toHaveClass('h-1');
    await expect(canvas.queryByRole('button', { name: 'New task' })).toBeNull();
  },
};

/** The workflow completed: every segment of the track is done. */
export const Completed: Story = {
  tags: ['contract'],
  args: { scenario: 'completed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('img', { name: 'All 7 steps · completed' })).toBeVisible();
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

/** The empty Tasks page names the same step as the Overview, and keeps the New task hint. */
export const TasksPageEmpty: Story = {
  tags: ['contract'],
  args: { scenario: 'not-started', page: 'tasks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Tasks appear when Break the solution down (step 4 of 7) finishes. Create tasks with New task, also before the workflow starts.',
      ),
    ).toBeVisible();
  },
};
