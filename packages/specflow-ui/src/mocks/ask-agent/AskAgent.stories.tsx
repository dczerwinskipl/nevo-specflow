import type { Meta, StoryObj } from '@storybook/react-vite';
import { AskAgentMock } from './AskAgentMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/workflow-execution.md,
 * "Run with agent"). Every other state of the mock is built for real (SpecFlow/Screens/Run with
 * agent, Agent attempt, Close specification); this one waits for the Runtime's project-wide hold.
 * No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Ask agent (mock)',
  component: AskAgentMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
} satisfies Meta<typeof AskAgentMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Another subject (the Overview) while an agent's outcome is unknown: every change waits. */
export const OutcomeUnknownOtherSubject: Story = {};
