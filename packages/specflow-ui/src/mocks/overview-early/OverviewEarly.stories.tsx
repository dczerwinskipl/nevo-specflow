import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewEarlyMock } from './OverviewEarlyMock.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview in early and sparse states, for owner
 * approval before production changes (handover: nevo-verify/dogfood-flow/overview-early-handover.md).
 * Static data mirroring the #156 dogfooding Specification. Each story pins one frame size.
 * Below 1408 px of content width every arrangement is the same one column, so 1440 has one story
 * per state; 1920 shows A' (contract), B (one column) and C (Documents in the work column).
 * No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Overview early states (mock)',
  component: OverviewEarlyMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { width: 1440, height: 900, scenario: 'write-spec', arrangement: 'contract' },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['not-started', 'requirements', 'write-spec', 'write-spec-session'],
    },
    arrangement: { control: 'inline-radio', options: ['contract', 'one-column', 'docs-in-work'] },
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

/* Write the Specification, by hand (the owner's dogfooding state) */
export const WriteSpec1440 = capture({});
export const WriteSpec1920A = capture({ ...wide });
export const WriteSpec1920B = capture({ ...wide, arrangement: 'one-column' });
export const WriteSpec1920C = capture({ ...wide, arrangement: 'docs-in-work' });
export const WriteSpec390 = capture({ ...narrow });

/* With an agent Session */
export const Session1440 = capture({ scenario: 'write-spec-session' });
export const Session1920A = capture({ ...wide, scenario: 'write-spec-session' });
export const Session1920B = capture({
  ...wide,
  scenario: 'write-spec-session',
  arrangement: 'one-column',
});
export const Session1920C = capture({
  ...wide,
  scenario: 'write-spec-session',
  arrangement: 'docs-in-work',
});

/* Gather requirements, with its Session */
export const Requirements1440 = capture({ scenario: 'requirements' });
export const Requirements1920A = capture({ ...wide, scenario: 'requirements' });
export const Requirements1920B = capture({
  ...wide,
  scenario: 'requirements',
  arrangement: 'one-column',
});
export const Requirements1920C = capture({
  ...wide,
  scenario: 'requirements',
  arrangement: 'docs-in-work',
});
export const Requirements390 = capture({ ...narrow, scenario: 'requirements' });

/* Just created */
export const NotStarted1440 = capture({ scenario: 'not-started' });
export const NotStarted1920A = capture({ ...wide, scenario: 'not-started' });
export const NotStarted1920B = capture({
  ...wide,
  scenario: 'not-started',
  arrangement: 'one-column',
});
export const NotStarted1920C = capture({
  ...wide,
  scenario: 'not-started',
  arrangement: 'docs-in-work',
});

/* The document Secondary at 50/50: the Overview is one column */
export const Doc1440Half = capture({ secondary: 'doc-half' });
export const Doc1920Half = capture({ ...wide, secondary: 'doc-half' });
