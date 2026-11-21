import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent } from 'storybook/test';
import { AskAgentMock } from './AskAgentMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/workflow-execution.md,
 * "Ask agent"). The real routed screens with the mock's Now block and dialogs; static data. No
 * Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Ask agent (mock)',
  component: AskAgentMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { state: 'return-requested' },
} satisfies Meta<typeof AskAgentMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/* 1. Close preview (D16) */
export const CloseUncommittedChanges: Story = { args: { state: 'close-uncommitted' } };

/* 3. The entry and the start dialog are real now: SpecFlow/Screens/Run with agent. */

/* 4. Running attempt: Stop, outcome unknown, finished, refused, confirmation are real now: SpecFlow/Screens/Agent attempt. */
export const ReturnRequested: Story = { args: { state: 'return-requested' } };
/** Another subject (the Overview) while an agent's outcome is unknown: every change waits. */
export const OutcomeUnknownOtherSubject: Story = { args: { state: 'outcome-unknown-other' } };

/* 5. After the agent stops */

/* 6. Pending owner confirmation (D17) */

/* 7. Take over and the attempt's history */
export const TakeOver: Story = { args: { state: 'take-over' } };
export const TakenOverWithHistory: Story = {
  args: { state: 'taken-over-history' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('region', { name: 'Now' }, { timeout: 10000 });
    const [history] = await canvas.findAllByRole('button', { name: /history/i });
    await userEvent.click(history!);
  },
};
