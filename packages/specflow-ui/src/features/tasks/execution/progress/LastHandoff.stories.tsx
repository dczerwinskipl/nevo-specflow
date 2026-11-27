import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { LastHandoff } from './LastHandoff';

const meta = {
  title: 'SpecFlow/Workflow/Last hand-off',
  component: LastHandoff,
  decorators: [
    withLocale('en'),
    (Story) => (
      // The Now block's width and padding: a phone column, or a reading column on a desktop.
      <div className="max-w-content-standard p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    heading: 'Last hand-off',
    outcome: 'Breakdown approved',
    lines: ['Review the breakdown', 'Claude Code · Opus 5.5', 'Nov 25, 5:09 PM'],
    commit: '3 documents · 3ca401a',
    tone: 'done',
    onOpenFeedback: fn(),
  },
} satisfies Meta<typeof LastHandoff>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Owner review (PR 169): the outcome, the step, the agent, when, "[commit] 3 documents · 3ca401a"
 * and one "View feedback ›" that opens the Feedback view. No preview, fade or nested toggle.
 */
export const Approved: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('button', { name: /Show feedback|Open full feedback/ }),
    ).toBeNull();
    await expect(canvas.getByText('Claude Code · Opus 5.5')).toBeVisible();
    await expect(canvas.getByText('3 documents · 3ca401a')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'View feedback' }));
    await expect(args.onOpenFeedback).toHaveBeenCalledOnce();
  },
};

/** A review that requested changes: marked in the attention tone, the same one View feedback. */
export const ChangesRequested: Story = {
  args: { outcome: 'Changes requested', tone: 'blocking', commit: undefined },
  play: async ({ canvasElement }) => {
    const handoff = canvasElement.querySelector<HTMLElement>('[data-now-handoff]')!;
    await expect(handoff.dataset.handoffTone).toBe('blocking');
    await expect(within(handoff).getByRole('button', { name: 'View feedback' })).toBeVisible();
  },
};

/** The agent's result waiting for the owner, in the info tone. */
export const WaitingForOwner: Story = {
  args: {
    heading: "The agent's result",
    lines: ['Claude Code · Opus 5.5', 'Nov 25, 5:09 PM'],
    tone: 'waiting',
  },
};

/** No feedback: no View feedback at all. */
export const NoFeedback: Story = {
  args: { onOpenFeedback: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'View feedback' })).toBeNull();
  },
};

/** Long result, step and commit lines wrap; nothing widens the column. */
export const LongTitles: Story = {
  args: {
    outcome:
      'Breakdown approved after the second review round with notes for the implementers of every task',
    lines: [
      'Review the breakdown against the specification, the solution and the acceptance criteria',
      'Claude Code · Opus 5.5',
      'Yesterday 5:09 PM',
    ],
    commit: '14 documents and 32 files · 3ca401a',
  },
};
