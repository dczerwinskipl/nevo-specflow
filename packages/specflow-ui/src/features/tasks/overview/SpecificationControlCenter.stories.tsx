import type { Meta, StoryObj } from '@storybook/react-vite';
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
        'blocked',
        'stuck',
        'empty',
        'completed',
        'abandoned',
        'no-task-workflow',
      ],
    },
    page: { control: 'inline-radio', options: ['overview', 'tasks', 'tasks-blocking'] },
  },
} satisfies Meta<typeof ControlCenterApp>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Waiting for tasks: Now with the progress, Requires attention, the Tasks summary, Sessions. */
export const Default: Story = {};

const capture = (args: Story['args']): Story => ({ tags: ['capture'], args });

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
