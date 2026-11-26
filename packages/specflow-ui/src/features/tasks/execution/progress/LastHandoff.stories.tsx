import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { LastHandoff } from './LastHandoff';

const approved = [
  'Approved. Attempt 2 resolves all four blocking points and (a)-(d) from attempt 1, checked against source:',
  '1. `documents-ui-one-client` depends on `create-in-memory-adapter` and removes `DocumentsApi.emulated`.',
  '2. Every specflow-ui importer of `@nevo/specflow-contracts/demo` (20 files) is deleted or retyped by the project Create form or the project Session start.',
  '3. The doc lines named in the transport removal match source (openapi.md:40, code-organization.md:190).',
  '4. The Sessions and Create suites cover every backend.md section 2 row and acceptance criterion 4.',
  '',
  '**Notes for implementers**, none of them blocking:',
  '',
  '- the grep exclusion says docs/adr/, but the ADRs are in docs/architecture/decisions/;',
  '- the tsconfig path alias for the demo entry point also goes;',
  '- `buildDemoSessions` is still used until the transport removal, so move it rather than delete it.',
].join('\n');

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
    meta: 'Review the breakdown · Claude Code · Opus 5.5 · Yesterday 5:09 PM',
    commit: '3 documents committed · 3ca401a',
    feedback: approved,
    tone: 'done',
    onOpenDetails: fn(),
    onOpenFeedback: fn(),
  },
} satisfies Meta<typeof LastHandoff>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Owner re-review (2026-11-26): "Show feedback" collapsed; open, a preview of a few lines and "Open
 * full feedback" to the work history. Long feedback never grows the Now block.
 */
export const LongFeedback: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/Attempt 2 resolves/)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Show feedback' }));
    await expect(canvas.getByText(/Attempt 2 resolves/)).toBeVisible();
    // A few lines: the preview is clipped well below the whole feedback's height.
    const preview = canvasElement.querySelector<HTMLElement>('[data-feedback-preview]')!;
    await expect(preview.clientHeight).toBeLessThan(preview.scrollHeight);
    await expect(preview.clientHeight).toBeLessThanOrEqual(96);
    await userEvent.click(canvas.getByRole('button', { name: 'Open full feedback' }));
    await expect(args.onOpenFeedback).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Hide feedback' }));
    await expect(canvas.queryByText(/Attempt 2 resolves/)).toBeNull();
  },
};

/** One sentence the preview shows whole: no fade and no "Open full feedback", nothing more to open. */
export const ShortFeedback: Story = {
  args: { feedback: 'Approved. Attempt 2 resolves all four blocking points from attempt 1.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show feedback' }));
    await expect(canvas.getByText(/Attempt 2 resolves/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Open full feedback' })).toBeNull();
  },
};

/** A review that requested changes: open from the start, marked in the attention tone. */
export const ChangesRequested: Story = {
  args: {
    outcome: 'Changes requested',
    tone: 'blocking',
    commit: undefined,
    feedback:
      'The breakdown misses the token refresh path: when the cookie expires mid-request the refresh drops the original return URL.\n\nT-04 and T-07 overlap on the rate-limit rules; merge them or say which one owns the limits.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Hide feedback' })).toBeVisible();
    await expect(canvas.getByText(/misses the token refresh path/)).toBeVisible();
  },
};

/**
 * The agent's result waiting for the owner: no detail view holds it yet, so the whole feedback is in
 * a bounded box that scrolls.
 */
export const WaitingForOwner: Story = {
  args: {
    heading: "The agent's result",
    outcome: 'Breakdown approved',
    tone: 'waiting',
    onOpenFeedback: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('group', { name: 'Feedback' });
    await expect(within(box).getByText(/buildDemoSessions/)).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Open full feedback' })).toBeNull();
  },
};

/** No feedback: no toggle at all. */
export const NoFeedback: Story = {
  args: { feedback: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Show feedback' })).toBeNull();
  },
};

/** Long result, step and commit lines wrap; nothing widens the column. */
export const LongTitles: Story = {
  args: {
    outcome:
      'Breakdown approved after the second review round with notes for the implementers of every task',
    meta: 'Review the breakdown against the specification, the solution and the acceptance criteria · Claude Code · Opus 5.5 · Yesterday 5:09 PM',
    commit: '14 documents and 32 files committed · 3ca401a',
  },
};
