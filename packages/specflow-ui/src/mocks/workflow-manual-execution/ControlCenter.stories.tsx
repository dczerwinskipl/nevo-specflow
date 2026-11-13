import type { Meta, StoryObj } from '@storybook/react-vite';
import { ControlCenterMock } from './ControlCenterMock.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview as a control center and the Tasks page
 * (docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md). Static fixtures;
 * each story pins one frame width. No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Specification control center (mock)',
  component: ControlCenterMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { width: 1440, height: 900, state: 'waiting', page: 'overview', columns: 'work' },
} satisfies Meta<typeof ControlCenterMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Default: waiting for tasks; Controls switch state, page, columns and frame. */
export const Default: Story = {
  argTypes: {
    state: {
      control: 'select',
      options: [
        'empty',
        'active',
        'waiting',
        'blocked',
        'completed',
        'abandoned',
        'no-task-workflow',
      ],
    },
    page: { control: 'inline-radio', options: ['overview', 'tasks'] },
    columns: { control: 'inline-radio', options: ['work', 'split'] },
    width: { control: { type: 'number', min: 320, max: 2200, step: 10 } },
    height: { control: { type: 'number', min: 360, max: 2000, step: 10 } },
  },
};

const capture = (args: Story['args']): Story => ({ tags: ['capture'], args });

export const OvwEmptyWide = capture({ state: 'empty' });
export const OvwActiveWide = capture({ state: 'active' });
export const OvwWaitingWide = capture({ state: 'waiting', height: 1100 });
export const OvwBlockedWide = capture({ state: 'blocked', height: 1000 });
export const OvwCompletedWide = capture({ state: 'completed' });
export const OvwAbandonedWide = capture({ state: 'abandoned' });
/** A Specification workflow that never produces Tasks: no Tasks preview. */
export const OvwNoTaskWorkflowWide = capture({ state: 'no-task-workflow' });
export const OvwActiveNarrow390 = capture({ state: 'active', width: 390, height: 1300 });
export const OvwWaitingNarrow390 = capture({ state: 'waiting', width: 390, height: 1700 });
export const OvwWaitingCompact900 = capture({ state: 'waiting', width: 900, height: 1300 });
/** A/B at a wide screen: A keeps Active tasks in the work column (existing rule). */
export const OvwWaitingWideA1920 = capture({ state: 'waiting', width: 1920, height: 1000 });
/** A/B: B moves Active tasks beside Sessions. */
export const OvwWaitingWideB1920 = capture({
  state: 'waiting',
  width: 1920,
  height: 1000,
  columns: 'split',
});
export const OvwTasksPageWide = capture({ state: 'waiting', page: 'tasks', height: 1200 });
export const OvwTasksPageNarrow390 = capture({
  state: 'waiting',
  page: 'tasks',
  width: 390,
  height: 1900,
});

/* Round 2: state / grouping / attention separated */
export const Ovw2Waiting1408 = capture({ state: 'waiting', width: 1408, height: 1100 });
export const Ovw2Waiting1440 = capture({ state: 'waiting', width: 1440, height: 1100 });
export const Ovw2Waiting1920 = capture({ state: 'waiting', width: 1920, height: 1000 });
export const Ovw2Blocked1408 = capture({ state: 'blocked', width: 1408, height: 1100 });
export const Ovw2Blocked1440 = capture({ state: 'blocked', width: 1440, height: 1100 });
export const Ovw2Blocked1920 = capture({ state: 'blocked', width: 1920, height: 1000 });
export const Ovw2Stuck1440 = capture({ state: 'stuck', width: 1440, height: 1000 });
export const Ovw2StuckNarrow390 = capture({ state: 'stuck', width: 390, height: 1500 });
export const Ovw2StuckTasksPage1440 = capture({ state: 'stuck', page: 'tasks', height: 1100 });
export const Ovw2StuckBlockingFilter1440 = capture({
  state: 'stuck',
  page: 'tasks',
  filter: 'blocking',
  height: 800,
});
export const Ovw2StuckBlockingFilterNarrow390 = capture({
  state: 'stuck',
  page: 'tasks',
  filter: 'blocking',
  width: 390,
  height: 1000,
});
export const Ovw2WaitingNarrow390 = capture({ state: 'waiting', width: 390, height: 1700 });
export const Ovw2BlockedNarrow390 = capture({ state: 'blocked', width: 390, height: 1600 });
export const Ovw2TasksPage1440 = capture({ state: 'waiting', page: 'tasks', height: 1200 });
export const Ovw2TasksPageNarrow390 = capture({
  state: 'waiting',
  page: 'tasks',
  width: 390,
  height: 1800,
});
