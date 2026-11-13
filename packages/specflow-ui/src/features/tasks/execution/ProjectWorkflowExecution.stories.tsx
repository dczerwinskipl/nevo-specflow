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
        'start-drift',
        'review',
        'rework',
        'spike-gate',
        'spike-gate-round-trip',
        'waiting',
        'close-blocked',
        'abandoned',
      ],
    },
  },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rework after a review asked for changes: the hand-off, Finish step and Return. */
export const TaskRework: Story = { tags: ['capture'] };
export const TaskFirstStart: Story = { tags: ['capture'], args: { scenario: 'first-start' } };
/** The workflow changes while the first-start dialog is open (confirm to see the refusal). */
export const TaskStartDrift: Story = { args: { scenario: 'start-drift' } };
export const TaskReview: Story = { tags: ['capture'], args: { scenario: 'review' } };
export const TaskGateUnmet: Story = { tags: ['capture'], args: { scenario: 'spike-gate' } };
/** Create the findings document from the gate, then Finish step again. */
export const TaskGateRoundTrip: Story = { args: { scenario: 'spike-gate-round-trip' } };
export const SpecificationWaiting: Story = { tags: ['capture'], args: { scenario: 'waiting' } };
export const SpecificationCloseBlocked: Story = { args: { scenario: 'close-blocked' } };
export const SpecificationAbandoned: Story = {
  tags: ['capture'],
  args: { scenario: 'abandoned' },
};
