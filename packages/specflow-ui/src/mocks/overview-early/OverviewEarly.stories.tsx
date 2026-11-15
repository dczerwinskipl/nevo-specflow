import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewEarlyMock } from './OverviewEarlyMock.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview in early and sparse states, variant D (every
 * applicable section always present, with a compact inline empty state), for owner approval before
 * production changes (handover: nevo-verify/dogfood-flow/overview-early-handover.md). Static data
 * mirroring the #156 dogfooding Specification; the accepted contract arrangement (two columns from
 * 1408 px of content width). Each story pins one frame size. No Chromatic, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Overview early states (mock)',
  component: OverviewEarlyMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { width: 1440, height: 900, scenario: 'write-spec' },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['not-started', 'requirements', 'write-spec', 'write-spec-session', 'tasks-created'],
    },
    secondary: { control: 'inline-radio', options: ['none', 'doc-half'] },
    width: { control: { type: 'number', min: 320, max: 2000, step: 10 } },
    height: { control: { type: 'number', min: 600, max: 1200, step: 10 } },
  },
} satisfies Meta<typeof OverviewEarlyMock>;
export default meta;
type Story = StoryObj<typeof meta>;

const wide = { width: 1920, height: 1080 } as const;
const narrow = { width: 390, height: 844 } as const;
const capture = (args: Story['args']): Story => ({ tags: ['capture'], args });

export const Default: Story = {};

/* Just created */
export const NotStarted1440 = capture({ scenario: 'not-started' });
export const NotStarted1920 = capture({ ...wide, scenario: 'not-started' });
export const NotStarted390 = capture({ ...narrow, scenario: 'not-started' });

/* Write the Specification */
export const WriteSpec1440 = capture({});
export const WriteSpec1920 = capture({ ...wide });
export const WriteSpec390 = capture({ ...narrow });

/* With one Session */
export const Session1440 = capture({ scenario: 'write-spec-session' });
export const Session1920 = capture({ ...wide, scenario: 'write-spec-session' });
export const Session390 = capture({ ...narrow, scenario: 'write-spec-session' });

/* First Tasks just created: the Tasks section fills */
export const TasksCreated1440 = capture({ scenario: 'tasks-created' });
export const TasksCreated1920 = capture({ ...wide, scenario: 'tasks-created' });
export const TasksCreated390 = capture({ ...narrow, scenario: 'tasks-created' });

/* The document Secondary at 50/50: the Overview is one column */
export const Doc1440Half = capture({ secondary: 'doc-half' });
