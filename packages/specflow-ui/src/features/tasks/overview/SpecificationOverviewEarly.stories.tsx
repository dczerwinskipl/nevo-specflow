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
        'requirements',
        'write-spec',
        'write-spec-retry',
        'write-spec-gate',
        'write-spec-session',
        'breakdown',
        'tasks-created',
        'ready',
        'waiting',
        'completed',
        'abandoned',
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
    // Without Tasks the section keeps the step line in place of a title.
    await expect(
      canvas.getByText('Break the solution down (step 4 of 7) creates the tasks.'),
    ).toBeVisible();
    await expect(canvas.getByText('This specification has no sessions yet.')).toBeVisible();
    // New session is the Sessions section's own action, never beside Start workflow.
    const newSession = canvas.getByRole('button', { name: 'New session' });
    await expect(newSession.closest('[data-workflow-now]')).toBeNull();
    // Every document is only its initial content: the header says it once, the rows say nothing.
    await expect(canvas.getByText('5 · initial content only')).toBeVisible();
    await expect(canvas.queryByText('Initial content only')).toBeNull();
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
      canvas.getByText('Documents that state what to build and how to tell it is done.'),
    ).toBeVisible();
    // A first attempt is not named; the step id and revision are in the ⋯ note only.
    const now = canvas.getByRole('region', { name: 'Now' });
    await expect(now).not.toHaveTextContent(/Attempt|rev 1/);
    await expect(within(now).getByText(/^In progress since .+ · started by you$/)).toBeVisible();
    await expect(canvas.getAllByText('Initial content only')).toHaveLength(2);
    // No document gates on this step (the shipped workflows): no "Done when", no relation labels.
    await expect(now.querySelector('[data-now-done-when]')).toBeNull();
    await expect(within(now).queryByText(/Done (with .+ )?when/)).toBeNull();
    await expect(canvas.queryByText(/needed to (finish|start)|used in/i)).toBeNull();
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
    // Documents: content state and relation are separate facts, named together when both apply.
    await expect(canvas.getByText('Needed to finish this step')).toBeInTheDocument();
    await expect(
      canvas.getByText('Initial content only · needed to start Design the solution'),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText('Initial content only')).toHaveLength(1);
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
    // The Tasks section lists the drafts as Task rows instead of its step line.
    await expect(await canvas.findByRole('list', { name: 'Needs approval' })).toBeVisible();
    await expect(canvas.queryByText(/creates the tasks\.$/)).toBeNull();
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
    // The Tasks of a completed workflow are done, not drafts.
    await expect(canvas.queryByText(/0 of 2/)).toBeNull();
    // Once the run ended no gate relates a document: only the content state stays.
    await expect(canvas.getAllByText('Initial content only')).toHaveLength(2);
  },
};

/** Step 1 just started: the first segment is current, nothing before it. */
export const Requirements: Story = {
  tags: ['contract'],
  args: { scenario: 'requirements' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('img', { name: 'Step 1 of 7: Gather requirements' }),
    ).toBeVisible();
    await expect(canvas.getByText('Step 1 of 7 · next: Write the Specification')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Finish step' })).toBeVisible();
    // Now offers no New task before the breakdown (the Tasks section keeps its own quiet one).
    const now = canvasElement.querySelector<HTMLElement>('[data-workflow-now]')!;
    await expect(within(now).queryByRole('button', { name: 'New task' })).toBeNull();
  },
};

/** A step finished; the next one is ready: Start is the only action, the track is on that step. */
export const Ready: Story = {
  tags: ['contract'],
  args: { scenario: 'ready' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Start Design the solution' }),
    ).toBeVisible();
    await expect(canvas.getByText('Ready to start')).toBeVisible();
    await expect(
      canvas.getByRole('img', { name: 'Step 3 of 7: Design the solution' }),
    ).toBeVisible();
  },
};

/**
 * An abandoned workflow: its reason under the title and no step track. The Engine's outline names
 * no step once the run ended, so "Ended at step N of M" cannot be shown without a new fact.
 */
export const Abandoned: Story = {
  tags: ['contract'],
  args: { scenario: 'abandoned' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('The relevance cutoff moved to the search ranking rework.'),
    ).toBeVisible();
    const now = canvas.getByRole('region', { name: 'Now' });
    await expect(within(now).queryByRole('img')).toBeNull();
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
        'Break the solution down (step 4 of 7) creates the tasks. You can also create them now with New task.',
      ),
    ).toBeVisible();
  },
};

/** The empty Tasks page of an ended workflow: like the Overview, nothing more is promised. */
export const TasksPageEmptyEnded: Story = {
  tags: ['contract'],
  args: { scenario: 'abandoned', page: 'tasks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No tasks were created')).toBeVisible();
    await expect(canvas.queryByText(/yet|appear here once|creates the tasks/)).toBeNull();
  },
};
