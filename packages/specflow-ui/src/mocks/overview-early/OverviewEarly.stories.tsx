import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewEarlyMock } from './OverviewEarlyMock.stories-support';

/*
 * PRESENTATION MOCK ONLY: the Specification Overview in early and sparse states, for owner
 * approval before production changes (handover: nevo-verify/dogfood-flow/overview-early-handover.md).
 * Static data mirroring the #156 dogfooding Specification. Each story pins one frame size.
 * No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Overview early states (mock)',
  component: OverviewEarlyMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { width: 1440, height: 900, scenario: 'write-spec', arrangement: 'proposed' },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['not-started', 'requirements', 'write-spec', 'write-spec-session'],
    },
    arrangement: { control: 'inline-radio', options: ['proposed', 'one-column'] },
    secondary: { control: 'inline-radio', options: ['none', 'doc-quarter', 'doc-half'] },
    width: { control: { type: 'number', min: 320, max: 2000, step: 10 } },
    height: { control: { type: 'number', min: 600, max: 1200, step: 10 } },
  },
} satisfies Meta<typeof OverviewEarlyMock>;
export default meta;
type Story = StoryObj<typeof meta>;

const wide = { width: 1920, height: 1080 } as const;
const narrow = { width: 390, height: 844 } as const;

export const Default: Story = {};

/* Write the Specification, by hand (the owner's dogfooding state) */
export const WriteSpec1440: Story = { tags: ['capture'] };
export const WriteSpec1920: Story = { tags: ['capture'], args: wide };
/** Variant B: one reading column at any width, no Workflow outline. */
export const WriteSpec1920OneColumn: Story = {
  tags: ['capture'],
  args: { ...wide, arrangement: 'one-column' },
};
export const WriteSpec390: Story = { tags: ['capture'], args: narrow };

/* The document Secondary: today's 75/25 split against the balanced split */
export const WriteSpecDoc1440Quarter: Story = {
  tags: ['capture'],
  args: { secondary: 'doc-quarter' },
};
export const WriteSpecDoc1440Half: Story = { tags: ['capture'], args: { secondary: 'doc-half' } };
export const WriteSpecDoc1920Quarter: Story = {
  tags: ['capture'],
  args: { ...wide, secondary: 'doc-quarter' },
};
export const WriteSpecDoc1920Half: Story = {
  tags: ['capture'],
  args: { ...wide, secondary: 'doc-half' },
};

/* With an agent Session */
export const WriteSpecSession1440: Story = {
  tags: ['capture'],
  args: { scenario: 'write-spec-session' },
};
export const WriteSpecSession1920: Story = {
  tags: ['capture'],
  args: { ...wide, scenario: 'write-spec-session' },
};

/* Earlier states */
export const NotStarted1440: Story = { tags: ['capture'], args: { scenario: 'not-started' } };
export const NotStarted1920: Story = {
  tags: ['capture'],
  args: { ...wide, scenario: 'not-started' },
};
export const Requirements1920: Story = {
  tags: ['capture'],
  args: { ...wide, scenario: 'requirements' },
};
export const Requirements390: Story = {
  tags: ['capture'],
  args: { ...narrow, scenario: 'requirements' },
};
