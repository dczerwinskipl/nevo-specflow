import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewSessionMock } from './NewSessionMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (owner acceptance of the New session rework, PR #174). Not production code:
 * no request is sent. The production screen is `SpecFlow/Screens/Session Start`; this composition
 * reuses its catalogue adapter, readiness policy, fields, tiles and Context sections. Size the
 * viewport (1440x900, 375x812) to compare with the production stories in the same states.
 */
const meta = {
  title: 'SpecFlow/Screens/New session (mock)',
  component: NewSessionMock,
  parameters: { layout: 'fullscreen' },
  args: { state: 'all-available', locale: 'pl', diagnosticsOpen: false },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['all-available', 'one-unavailable', 'none-available'],
    },
    locale: { control: 'inline-radio', options: ['pl', 'en'] },
  },
} satisfies Meta<typeof NewSessionMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1. Every agent available: Claude preselected, the model is the one choice left. */
export const AllAvailable: Story = {};

/** 2. Codex: CLI not found. The card says so in one line; the shared line below offers the fix. */
export const OneUnavailable: Story = { args: { state: 'one-unavailable' } };

/** 3. No agent available: nothing to configure; Start is disabled and "Check again" is offered. */
export const NoneAvailable: Story = { args: { state: 'none-available' } };

/** 4. State 2 with "How to fix" open: the full diagnostics, keys and paths as code. */
export const DiagnosticsExpanded: Story = {
  args: { state: 'one-unavailable', diagnosticsOpen: true },
};

/** State 3 with every agent's diagnostics open. */
export const NoneAvailableExpanded: Story = {
  args: { state: 'none-available', diagnosticsOpen: true },
};

/** Codex chosen: it offers no model choice, so Model is the fact "Provider default" and no Effort. */
export const CodexSelected: Story = { args: { selected: 'codex' } };

export const AllAvailableEn: Story = { args: { locale: 'en' } };
export const OneUnavailableEn: Story = { args: { state: 'one-unavailable', locale: 'en' } };
export const NoneAvailableEn: Story = { args: { state: 'none-available', locale: 'en' } };
export const DiagnosticsExpandedEn: Story = {
  args: { state: 'one-unavailable', diagnosticsOpen: true, locale: 'en' },
};
