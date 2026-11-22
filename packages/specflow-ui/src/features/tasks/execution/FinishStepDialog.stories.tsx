import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '@nevo/ui';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { FinishStepDialog, type ArtifactOption, type FinishDraft } from './FinishStepDialog';
import { taskWorkflowProjection } from './projections.stories-support';

const documents: readonly ArtifactOption[] = [
  { value: 'overview.md', label: 'Sign-in with the company identity provider' },
  { value: 'notes/overview.md', label: 'Sign-in with the company identity provider' },
  { value: 'verification.md', label: 'Verification evidence' },
];

function Fixture({
  artifactOptions = documents,
  locale = 'en',
  onSubmit,
}: {
  artifactOptions?: readonly ArtifactOption[];
  locale?: 'en' | 'pl';
  onSubmit: (draft: FinishDraft) => void;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<FinishDraft>({
    attemptKey: 'review#1',
    transitionId: 'approved',
    feedback: '',
    artifacts: [],
    droppedDrafts: [],
  });

  return (
    <StoryLocalization locale={locale}>
      <Button onClick={() => setOpen(true)}>Open Finish</Button>
      <FinishStepDialog
        open={open}
        onOpenChange={setOpen}
        stepTitle="Review"
        finish={taskWorkflowProjection('review').actions.finish!}
        draft={draft}
        onDraftChange={setDraft}
        rechecked={false}
        artifactOptions={artifactOptions}
        producesTasks={false}
        pending={false}
        error={null}
        onSubmit={() => onSubmit(draft)}
      />
    </StoryLocalization>
  );
}

const meta = {
  title: 'SpecFlow/Workflow/Finish step',
  component: Fixture,
  args: { onSubmit: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FindAttachments: Story = {
  play: async ({ args }) => {
    const page = within(document.body);
    const lookup = await page.findByRole('combobox', { name: 'Attach document' });
    await userEvent.type(lookup, 'overview');
    const options = await page.findAllByRole('option');
    await expect(options).toHaveLength(2);
    await expect(options[0]).toHaveTextContent('overview.md');
    await expect(options[1]).toHaveTextContent('notes/overview.md');
    await userEvent.clear(lookup);
    await userEvent.type(lookup, 'notes/overview');
    await page.findByRole('option', { name: /notes\/overview\.md/ });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(lookup).toHaveValue('');
    await expect(page.queryByRole('option', { name: /notes\/overview\.md/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument());
    await expect(page.getByRole('dialog')).toBeVisible();
    const attached = await page.findByRole('list', { name: 'Attached artifacts' });
    await expect(attached).toHaveTextContent('notes/overview.md');
    await expect(attached).toHaveTextContent('Sign-in with the company identity provider');
    await userEvent.type(lookup, 'verification');
    await page.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument());
    await expect(page.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(page.getByRole('button', { name: 'Open Finish' }));
    const reopened = await page.findByRole('combobox', { name: 'Attach document' });
    await expect(reopened).toHaveValue('');
    await userEvent.type(reopened, 'not-a-document');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument());
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(page.getByRole('button', { name: 'Open Finish' }));
    await expect(await page.findByRole('combobox', { name: 'Attach document' })).toHaveValue('');
  },
};

/** The last attachment removes the lookup; removal restores it and returns focus. */
export const LastAttachmentAndLongPath: Story = {
  args: {
    artifactOptions: [
      {
        value: `evidence/${'verification-with-a-long-project-specific-name-'.repeat(4)}report.md`,
        label: 'Verification evidence for a long project-specific document title',
      },
    ],
  },
  play: async () => {
    const previous = { width: window.innerWidth, height: window.innerHeight };
    await settleViewport(320, 844);
    try {
      const page = within(document.body);
      const lookup = await page.findByRole('combobox', { name: 'Attach document' });
      await userEvent.type(lookup, 'report.md');
      const option = await page.findByRole('option');
      await expect(option.scrollWidth).toBeLessThanOrEqual(option.clientWidth + 1);
      await userEvent.click(option);
      const remove = page.getByRole('button', { name: /Remove .*report\.md/ });
      await expect(remove).toHaveFocus();
      await userEvent.click(remove);
      const restored = page.getByRole('combobox', { name: 'Attach document' });
      await expect(restored).toHaveFocus();
      await expect(restored).toHaveValue('');
      await userEvent.type(restored, 'evidence');
      await expect(await page.findByRole('option')).toBeVisible();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument());
    } finally {
      await settleViewport(previous.width, previous.height);
    }
  },
};

export const Polish: Story = {
  args: { locale: 'pl' },
  play: async () => {
    const page = within(document.body);
    const lookup = await page.findByRole('combobox', { name: 'Dołącz dokument' });
    await expect(lookup).toHaveAttribute('placeholder', 'Znajdź po tytule lub nazwie pliku');
    await userEvent.type(lookup, 'verification');
    await expect(await page.findByRole('option', { name: /verification\.md/ })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument());
  },
};
