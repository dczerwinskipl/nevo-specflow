import type { Meta, StoryObj } from '@storybook/react-vite';
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
        'implement-gate',
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
/** Not started and on hold with a reason: neutral status, the first step's Goal and Resume. */
export const TaskOnHold: Story = { tags: ['capture'], args: { scenario: 'on-hold' } };
/** Rework after a review asked for changes: the hand-off, Finish step, and Return in ⋯. */
export const TaskRework: Story = { tags: ['capture'] };
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
