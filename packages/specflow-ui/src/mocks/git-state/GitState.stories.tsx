import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { GitStateMock } from './GitStateMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (owner acceptance, PR #169, round 2): the Git state of a Specification on
 * its Overview (the shipped Repository section with Git state, Commit and Discard), the Commit and
 * Discard dialogs, Now's failed-commit note, the Changes page and the Run with agent blocker. Real
 * routed screens with only those regions replaced; static data. No Chromatic snapshots; the play
 * functions only open the screen a story shows.
 */
const meta = {
  title: 'SpecFlow/Screens/Git state (mock)',
  component: GitStateMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { state: 'clean' },
} satisfies Meta<typeof GitStateMock>;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = { timeout: 15000 };

/** Opens a navigation entry: in the side navigation, or behind ☰ on a phone. */
async function openNavigation(canvasElement: HTMLElement, name: string) {
  const canvas = within(canvasElement);
  await canvas.findByRole('region', { name: 'Now' }, wait);
  const direct = canvas.queryAllByRole('link', { name }).find((link) => link.offsetParent);
  if (direct) {
    await userEvent.click(direct);

    return;
  }

  await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }));
  await userEvent.click(await within(document.body).findByRole('link', { name }, wait));
}

/* The Overview's Repository section */
export const Clean: Story = {};
export const CommittedJustNow: Story = { args: { state: 'committed-just-now' } };
export const SavedInSpecFlowNothingWaits: Story = { args: { state: 'saved-nothing-waits' } };
export const ChangedOutsideSpecFlow: Story = { args: { state: 'changed-outside' } };
export const TakenOverFromAgent: Story = { args: { state: 'taken-over' } };
export const CloseWaitsForSaves: Story = { args: { state: 'close-waits' } };
export const AgentCommitFailed: Story = { args: { state: 'commit-failed' } };
/** After the owner committed the agent's work: Now moves on, Confirm and Reject continue. */
export const AgentWorkCommittedByYou: Story = { args: { state: 'commit-failed-committed-by-you' } };
/** The attempt's history says who committed its work (the committed row). */
export const HistoryCommittedByYou: Story = {
  args: { state: 'history-committed-by-you' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('region', { name: 'Now' }, wait);
    const direct = canvas.queryByRole('button', { name: 'Activity history' });
    if (direct) {
      await userEvent.click(direct);
    } else {
      await userEvent.click(canvas.getAllByRole('button', { name: 'More actions' })[0]!);
      await userEvent.click(
        await within(document.body).findByRole('menuitem', { name: 'Activity history' }, wait),
      );
    }
  },
};
export const ManyFilesLongPaths: Story = { args: { state: 'many-files' } };
export const SavesBeingWritten: Story = { args: { state: 'being-saved' } };
export const BranchChanged: Story = { args: { state: 'branch-changed' } };
export const GitStateUnknown: Story = { args: { state: 'unknown' } };
export const NoGit: Story = { args: { state: 'git-off' } };

/* The same files elsewhere */
export const ChangesPage: Story = {
  args: { state: 'changes-page' },
  play: async ({ canvasElement }) => openNavigation(canvasElement, 'Changes'),
};
export const RunWithAgentBlocked: Story = {
  args: { state: 'run-with-agent-blocked' },
  play: async ({ canvasElement }) => {
    const now = await within(canvasElement).findByRole('region', { name: 'Now' }, wait);
    await userEvent.click(await within(now).findByRole('button', { name: 'Run with agent' }, wait));
  },
};

/* The Commit dialog */
export const CommitDialog: Story = { args: { state: 'dialog-taken-over' } };
export const CommitDialogSavedTogether: Story = { args: { state: 'dialog-saved-together' } };
export const CommitDialogManyFiles: Story = { args: { state: 'dialog-many-files' } };
export const CommitDialog200FileLimit: Story = { args: { state: 'dialog-path-limit' } };
export const CommitDialogNothingChosen: Story = { args: { state: 'dialog-nothing-chosen' } };
export const CommitDialogAgentCommitFailed: Story = {
  args: { state: 'dialog-agent-commit-failed' },
};
export const CommitDialogSavesBeingWritten: Story = { args: { state: 'dialog-being-saved' } };
export const CommitDialogBranchChanged: Story = { args: { state: 'dialog-branch-changed' } };
export const CommitDialogCommitting: Story = { args: { state: 'dialog-committing' } };
export const CommitDialogRefusedByHook: Story = { args: { state: 'dialog-refused-hook' } };
export const CommitDialogFileChanged: Story = { args: { state: 'dialog-conflict' } };

/* Discard */
export const DiscardChoose: Story = { args: { state: 'discard-choose' } };
export const DiscardConfirm: Story = { args: { state: 'discard-confirm' } };
export const DiscardAgentWork: Story = { args: { state: 'discard-agent-work' } };
export const DiscardRefused: Story = { args: { state: 'discard-refused' } };
