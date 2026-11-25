import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ControlCenterApp } from './ControlCenterApp.stories-support';

const meta = {
  title: 'SpecFlow/Screens/Specification control center',
  component: ControlCenterApp,
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'waiting', page: 'overview' },
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'waiting',
        'changes-requested',
        'blocked',
        'stuck',
        'empty',
        'completed',
        'abandoned',
        'no-task-workflow',
      ],
    },
    page: {
      control: 'inline-radio',
      options: ['overview', 'tasks', 'tasks-blocking', 'tasks-waiting'],
    },
  },
} satisfies Meta<typeof ControlCenterApp>;
export default meta;
type Story = StoryObj<typeof meta>;
const wait = { timeout: 5000 };

/**
 * Waiting for tasks: Now with the step and Task progress, the Last hand-off (an approved breakdown,
 * its feedback collapsed, what it committed), Requires attention, the Tasks summary, Sessions.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const handoff = await within(canvasElement).findByRole(
      'heading',
      { name: 'Last hand-off' },
      wait,
    );
    const block = handoff.closest<HTMLElement>('[data-now-handoff]')!;
    await expect(within(block).getByText('Breakdown approved')).toBeVisible();
    await expect(
      await within(block).findByText('4 documents committed · 05f9d80', {}, wait),
    ).toBeVisible();
    await expect(within(block).queryByText(/No gaps or conflicts/)).toBeNull();
    await expect(within(block).getByRole('button', { name: 'Show feedback' })).toBeVisible();
  },
};

const capture = (args: Story['args']): Story => ({ tags: ['capture'], args });

/**
 * The review requested changes: the breakdown is ready to start again and the Last hand-off leads
 * with the review's feedback, open and in the attention tone.
 */
export const ChangesRequested: Story = {
  args: { scenario: 'changes-requested' },
  play: async ({ canvasElement }) => {
    const handoff = await within(canvasElement).findByRole(
      'heading',
      { name: 'Last hand-off' },
      wait,
    );
    const block = handoff.closest<HTMLElement>('[data-now-handoff]')!;
    await expect(within(block).getByText('Changes requested')).toBeVisible();
    await expect(within(block).getByText(/misses the token refresh path/)).toBeVisible();
    await expect(block.dataset.handoffTone).toBe('blocking');
  },
};

export const Blocked = capture({ scenario: 'blocked' });
export const Stuck = capture({ scenario: 'stuck' });
export const Empty = capture({ scenario: 'empty' });
export const Completed = capture({ scenario: 'completed' });
export const Abandoned = capture({ scenario: 'abandoned' });
/** A Specification workflow that never produces Tasks: no Tasks summary. */
export const NoTaskWorkflow = capture({ scenario: 'no-task-workflow' });
export const TasksPage = capture({ page: 'tasks' });
/** Review tasks: only the Tasks blocking the Specification, with the clearable filter bar. */
export const TasksPageBlocking = capture({ scenario: 'stuck', page: 'tasks-blocking' });
/** The Overview's "N more in Waiting": only that group, with the clearable group filter. */
export const TasksPageGroup = capture({ page: 'tasks-waiting' });
