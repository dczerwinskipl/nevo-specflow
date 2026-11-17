import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewSessionMock } from './NewSessionMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (owner acceptance of the New session rework, PR #174). Not production code:
 * no request is sent. The production screen is `SpecFlow/Screens/Session Start`; this composition
 * reuses its catalogue adapter, readiness policy, fields and Context sections. Size the viewport
 * (1440x900, 375x812) to compare with the production stories in the same states.
 */
const meta = {
  title: 'SpecFlow/Screens/New session (mock)',
  component: NewSessionMock,
  parameters: { layout: 'fullscreen' },
  args: { state: 'all-available', locale: 'pl', diagnosticsOpen: false },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['all-available', 'one-unavailable', 'none-available', 'longest-statuses'],
    },
    locale: { control: 'inline-radio', options: ['pl', 'en'] },
  },
} satisfies Meta<typeof NewSessionMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The diagnostics panel is a modal Drawer: it hides the page from assistive technology. */
const panelOpen = { a11y: { test: 'off' as const } };

/** 1. Every agent available: Claude preselected, the model is the one choice left. */
export const AllAvailable: Story = {};

/** 2. Codex: CLI not found. The card says so in one line; the shared line below offers the fix. */
export const OneUnavailable: Story = { args: { state: 'one-unavailable' } };

/** 3. No agent available: a compact message under the cards with "Check again"; no Start. */
export const NoneAvailable: Story = { args: { state: 'none-available' } };

/** 4. State 2 with "How to fix" open: a side panel (a bottom sheet on narrow layouts). */
export const DiagnosticsExpanded: Story = {
  args: { state: 'one-unavailable', diagnosticsOpen: true },
  parameters: panelOpen,
};

/** State 3 with every agent's diagnostics open. */
export const NoneAvailableExpanded: Story = {
  args: { state: 'none-available', diagnosticsOpen: true },
  parameters: panelOpen,
};

/** Codex chosen: it offers no model choice, so Model is the fact "Provider default" and no Effort. */
export const CodexSelected: Story = { args: { selected: 'codex' } };

/** The longest short statuses on every card: one line at 375 and in three columns. */
export const LongestStatuses: Story = { args: { state: 'longest-statuses' } };
export const LongestStatusesEn: Story = { args: { state: 'longest-statuses', locale: 'en' } };

export const AllAvailableEn: Story = { args: { locale: 'en' } };
export const OneUnavailableEn: Story = { args: { state: 'one-unavailable', locale: 'en' } };
export const NoneAvailableEn: Story = { args: { state: 'none-available', locale: 'en' } };
export const DiagnosticsExpandedEn: Story = {
  args: { state: 'one-unavailable', diagnosticsOpen: true, locale: 'en' },
  parameters: panelOpen,
};
