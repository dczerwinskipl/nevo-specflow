import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitStateMock } from './GitStateMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (owner acceptance, PR #169): the Git state of a Specification on its
 * Overview (the Repository section) and the Commit dialog. The real routed Overview with only the
 * Repository section replaced; static data. No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Git state (mock)',
  component: GitStateMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { state: 'clean' },
} satisfies Meta<typeof GitStateMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/* The section */
export const Clean: Story = {};
export const CommittedJustNow: Story = { args: { state: 'committed-just-now' } };
export const SavedInSpecFlowNothingWaits: Story = { args: { state: 'saved-in-specflow' } };
export const ChangedOutsideSpecFlow: Story = { args: { state: 'changed-outside' } };
export const TakenOverFromAgent: Story = { args: { state: 'taken-over' } };
export const CloseWaitsForDocuments: Story = { args: { state: 'close-waits' } };
export const AgentCommitFailed: Story = { args: { state: 'commit-failed' } };
export const ManyFilesLongPaths: Story = { args: { state: 'many-files' } };
export const GitStateUnknown: Story = { args: { state: 'unknown' } };
export const NoGit: Story = { args: { state: 'git-off' } };

/* The Commit dialog */
export const CommitDialog: Story = { args: { state: 'dialog-taken-over' } };
export const CommitDialogManyFiles: Story = { args: { state: 'dialog-many-files' } };
export const CommitDialogNothingChosen: Story = { args: { state: 'dialog-nothing-chosen' } };
export const CommitDialogAgentCommitFailed: Story = {
  args: { state: 'dialog-agent-commit-failed' },
};
export const CommitDialogCommitting: Story = { args: { state: 'dialog-committing' } };
export const CommitDialogRefused: Story = { args: { state: 'dialog-refused' } };
