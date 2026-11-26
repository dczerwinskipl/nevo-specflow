import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { WorkflowExecutionFixture } from './ProjectWorkflowExecution.stories-support';

const meta = {
  title: 'SpecFlow/Screens/Manual workflow execution',
  component: WorkflowExecutionFixture,
  excludeStories: ['WorkflowExecutionFixture'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'rework' },
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'first-start',
        'on-hold',
        'dependencies',
        'implement-gate',
        'review-agent',
        'start-drift',
        'review',
        'rework',
        'spike-gate',
        'spike-gate-round-trip',
        'waiting',
        'close-blocked',
        'abandoned',
        'tasks-open',
      ],
    },
  },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Implement with its one exit gate unmet: Goal, "Done when" (the gate, then Review), and opening
 * task.md as the main action with Finish step beside it. Return and the step id are in ⋯.
 */
export const TaskImplementGate: Story = {
  tags: ['capture'],
  args: { scenario: 'implement-gate' },
};
/**
 * Review run by an agent: no Finish step for the viewer, yet "Done when" lists the gate that only
 * Approved needs (with its missing section) and no next step, since the results part ways.
 * Starting Review again is in ⋯ as "Restart Review".
 */
export const TaskReviewByAgent: Story = {
  tags: ['capture'],
  args: { scenario: 'review-agent' },
};
/** Not started and on hold with a reason: neutral status, the first step's Goal and Resume. */
export const TaskOnHold: Story = { tags: ['capture'], args: { scenario: 'on-hold' } };
/**
 * Approved but held by two open dependencies: the actionable readiness leads ("Waiting for
 * dependencies"), the lifecycle position is the quiet line, and the count closes the state with
 * View dependencies (interaction-model.md "Visual conventions", one shared Now).
 */
export const TaskWaitingForDependencies: Story = {
  args: { scenario: 'dependencies' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const now = await canvas.findByRole('region', { name: 'Now' }, { timeout: 10000 });
    await expect(await within(now).findByText('Waiting for dependencies')).toBeVisible();
    await expect(within(now).getByText('Not started · First step · Design')).toBeVisible();
    await expect(within(now).getByText('2 dependencies remaining')).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'View dependencies' })).toBeVisible();
    await expect(within(now).queryByText(/Waiting for 2 dependencies/)).toBeNull();
  },
};
/** Rework after a review asked for changes: the hand-off, Finish step, and Return in ⋯. */
export const TaskRework: Story = { tags: ['capture'] };
/**
 * A step without document gates (the shipped workflows): no "Done when" at all, only where the work
 * goes; no document carries a relation ("needed to …").
 */
export const TaskWithoutGates: Story = {
  args: { scenario: 'rework' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const now = await canvas.findByRole('region', { name: 'Now' }, { timeout: 10000 });
    await expect(await within(now).findByText('Then: Review')).toBeVisible();
    await expect(now.querySelector('[data-now-done-when]')).toBeNull();
    await expect(within(now).queryByText(/Done (with .+ )?when/)).toBeNull();
    await expect(canvas.queryByText(/needed to (finish|start)/i)).toBeNull();
  },
};
export const TaskFirstStart: Story = { tags: ['capture'], args: { scenario: 'first-start' } };
/** The workflow changes while the first-start dialog is open (confirm to see the refusal). */
export const TaskStartDrift: Story = { args: { scenario: 'start-drift' } };
export const TaskReview: Story = { tags: ['capture'], args: { scenario: 'review' } };
export const TaskGateUnmet: Story = { tags: ['capture'], args: { scenario: 'spike-gate' } };
/** Create the findings document from the gate, then Finish step again. */
export const TaskGateRoundTrip: Story = { args: { scenario: 'spike-gate-round-trip' } };
export const SpecificationWaiting: Story = { tags: ['capture'], args: { scenario: 'waiting' } };
/** Close names the workflow blockers and the agent Session still working in the worktree. */
export const SpecificationCloseBlocked: Story = { args: { scenario: 'close-blocked' } };
/** Acceptance would complete the Specification while Tasks are open: Finish names them. */
export const SpecificationTasksOpen: Story = { args: { scenario: 'tasks-open' } };
export const SpecificationAbandoned: Story = {
  tags: ['capture'],
  args: { scenario: 'abandoned' },
};
