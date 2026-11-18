import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WorkflowExecutionFixture } from '../ProjectWorkflowExecution.stories-support';

/*
 * The Close dialog over the routed Specification Overview, one story per outcome: the dialog is
 * opened as a person would (Now's Close specification, or the header's More actions while the
 * workflow still runs). Only the Runtime ports are fakes.
 */

const meta = {
  title: 'SpecFlow/Screens/Close specification',
  component: WorkflowExecutionFixture,
  excludeStories: ['WorkflowExecutionFixture'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'close-integrates' },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Opens Close from Now (an ended workflow) and returns the dialog. */
async function openFromNow(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Close specification' }, { timeout: 10000 }),
  );

  return within(await within(document.body).findByRole('dialog'));
}

/** Opens Close from the header's More actions (the workflow still runs) and returns the dialog. */
async function openFromMenu(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await canvas.findByRole('region', { name: 'Now' }, { timeout: 10000 });
  const [more] = canvas.getAllByRole('button', { name: 'More actions' });
  await userEvent.click(more!);
  await userEvent.click(
    await within(document.body).findByRole('menuitem', { name: 'Close specification' }),
  );

  return within(await within(document.body).findByRole('dialog'));
}

/** The detail of a fact row (`DescriptionList`), by its term. */
const fact = (dialog: { getByText: (text: string) => HTMLElement }, term: string) =>
  dialog.getByText(term).nextElementSibling?.textContent;

/** The check runs: one live line, and after 3 s the slow part; only Cancel. */
export const Checking: Story = {
  args: { scenario: 'close-checking' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(dialog.getByText('Checking whether Single sign-on can close…')).toBeVisible();
    await expect(
      await dialog.findByText(
        'Checking the repository. This can take a few seconds.',
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Close and archive' })).toBeNull();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  },
};

/** Saved documents are still being committed: the check repeats by itself. */
export const CheckingDocumentCommits: Story = {
  args: { scenario: 'close-commit-pending' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByText('Saving document commits…')).toBeVisible();
  },
};

/** The check itself failed: what to do, Dismiss and Check again. */
export const CheckFailed: Story = {
  args: { scenario: 'close-check-failed' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Could not check whether Single sign-on can close',
    );
    await expect(dialog.getByRole('button', { name: 'Check again' })).toBeVisible();
  },
};

/**
 * Repository problems: uncommitted files (commit first, the discard warning, Copy path) and no
 * integration branch (candidates with their facts, none chosen, Copy setting off).
 */
export const BlockedRepository: Story = {
  args: { scenario: 'close-repository' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(
      await dialog.findByText('Single sign-on cannot close yet: 2 repository problems.'),
    ).toBeVisible();
    await expect(dialog.getByText('Discarding deletes these changes for good.')).toBeVisible();
    // The worktree's path comes from the registered workspaces.
    await expect(
      await dialog.findByText('D:\\repos\\acme-portal\\.nevo\\worktrees\\nevo-1'),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy path' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Copy setting' })).toBeDisabled();
    await expect(dialog.getByLabelText('Setting for .nevo/config.yaml')).toHaveTextContent(
      'integrationTargetBranch: <choose a branch>',
    );
    for (const radio of dialog.getAllByRole('radio')) {
      await expect(radio).not.toBeChecked();
    }

    await expect(dialog.queryByRole('button', { name: 'Abandon instead' })).toBeNull();
  },
};

/** A candidate chosen: the setting names it and Copy setting is on. */
export const BlockedRepositoryBranchChosen: Story = {
  args: { scenario: 'close-repository' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await userEvent.click(await dialog.findByRole('radio', { name: 'release/2026.11' }));
    await expect(dialog.getByLabelText('Setting for .nevo/config.yaml')).toHaveTextContent(
      'integrationTargetBranch: release/2026.11',
    );
    await expect(dialog.getByRole('button', { name: 'Copy setting' })).toBeEnabled();
  },
};

/** "Another local branch…", then one chosen from the select: the setting names it. */
export const BlockedRepositoryOtherBranch: Story = {
  args: { scenario: 'close-repository' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await userEvent.click(await dialog.findByRole('radio', { name: 'Another local branch…' }));
    await expect(dialog.getByRole('button', { name: 'Copy setting' })).toBeDisabled();
    await userEvent.click(dialog.getByRole('combobox', { name: 'Local branch' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'hotfix/login-timeout' }),
    );
    await expect(dialog.getByLabelText('Setting for .nevo/config.yaml')).toHaveTextContent(
      'integrationTargetBranch: hotfix/login-timeout',
    );
    await expect(dialog.getByRole('button', { name: 'Copy setting' })).toBeEnabled();
  },
};

/** Without `workspace.view` the checkout is only named: no path, nothing to copy. */
export const BlockedRepositoryWithoutWorkspaces: Story = {
  args: { scenario: 'close-repository-no-workspaces' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(
      await dialog.findByText("Commit them in the specification's checkout, then check again."),
    ).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Copy path' })).toBeNull();
  },
};

/**
 * Files not committed in the main folder the Specification merges into: the lead says they may
 * not belong to it; five of eight named, then "and 3 more".
 */
export const BlockedIntegrationTargetFiles: Story = {
  args: { scenario: 'close-repository-target' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(
      await dialog.findByRole('heading', { name: 'Uncommitted files where it merges · 8' }),
    ).toBeVisible();
    await expect(dialog.getByText(/They may not belong to this specification/)).toBeVisible();
    await expect(dialog.getByText('and 3 more')).toBeVisible();
    await expect(await dialog.findByText('D:\\repos\\acme-portal')).toBeVisible();
  },
};

/** No candidate: only the other local branches, "Showing 3 of 240". */
export const BlockedOtherBranchesOnly: Story = {
  args: { scenario: 'close-repository-other-branches' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByText('Showing 3 of 240 local branches.')).toBeVisible();
    await expect(dialog.queryByRole('radio')).toBeNull();
    await expect(dialog.getByRole('combobox', { name: 'Local branch' })).toBeVisible();
  },
};

/** No local branch can receive the Close: nothing to choose or copy. */
export const BlockedNoBranches: Story = {
  args: { scenario: 'close-repository-no-branches' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByText(/No local branch can receive it/)).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Copy setting' })).toBeNull();
  },
};

/** The workflow still runs and Tasks are open: linked Tasks with their status, Abandon instead. */
export const BlockedTasks: Story = {
  args: { scenario: 'close-blocked' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromMenu(canvasElement);
    await waitFor(() =>
      expect(
        dialog.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
      ).toEqual(['Running sessions', 'Workflow', 'Unfinished tasks · 4', 'Pending writes · 1']),
    );
    await expect(dialog.getByRole('button', { name: 'Abandon instead' })).toBeVisible();
    await expect(dialog.queryByRole('button', { name: 'Check again' })).toBeNull();
    // A held Task names why, as its Tasks page row does.
    await expect(
      await dialog.findByText('Waiting for the identity provider sandbox account from IT.'),
    ).toBeVisible();
  },
};

/** Ready: Merges, Tasks and Documents, the archive note, Close and archive. */
export const ReadyIntegrates: Story = {
  args: { scenario: 'close-integrates' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByText('Ready to close')).toBeVisible();
    await expect(fact(dialog, 'Merges')).toBe('nevo-1/single-sign-on → release/2026.11');
    // The same counts and words as Now behind it; the Overview's Tasks section agrees.
    await expect(fact(dialog, 'Tasks')).toBe('All 6 tasks done');
    // Documents still only their initial content: informative, last, in the shared vocabulary.
    await expect(fact(dialog, 'Documents')).toMatch(/^2 with initial content only: /);
    // The Close names content states only, never a workflow relation.
    await expect(dialog.queryByText(/needed to (finish|start)/i)).toBeNull();
    await expect(within(canvasElement).queryByText('No tasks yet')).toBeNull();
    await expect(
      dialog.getByText('Closing archives the specification; it cannot be reopened.'),
    ).toBeVisible();
  },
};

export const ReadyNothingToMerge: Story = {
  args: { scenario: 'close-nothing-to-merge' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await dialog.findByText('Ready to close');
    await expect(fact(dialog, 'Merges')).toBe('Nothing to merge');
  },
};

export const ReadyPrimaryCheckout: Story = {
  args: { scenario: 'close-primary' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await dialog.findByText('Ready to close');
    await expect(fact(dialog, 'Merges')).toBe(
      'Archives on develop (main folder; nothing to merge)',
    );
  },
};

export const ReadyGitOff: Story = {
  args: { scenario: 'close-git-off' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await dialog.findByText('Ready to close');
    await expect(fact(dialog, 'Merges')).toContain(
      'Archives without Git (Git is off for this project)',
    );
    // No repository check ran: the alert does not claim one passed.
    await expect(
      dialog.getByText('The workflow is complete. Git is off, so nothing is merged.'),
    ).toBeVisible();
  },
};

/** Abandoned: the reason, then Result, Merges and Tasks; no "ready" banner. */
export const Abandoned: Story = {
  args: { scenario: 'abandoned' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await expect(await dialog.findByText('Recorded as not delivered')).toBeVisible();
    await expect(dialog.queryByText('Ready to close')).toBeNull();
    await expect(dialog.getByRole('button', { name: 'Close and archive' })).toBeEnabled();
    // Now's words and counts: "5 tasks cancelled · 1 done", in Now and in the dialog.
    await expect(fact(dialog, 'Tasks')).toBe('5 tasks cancelled · 1 done');
    await expect(within(canvasElement).getByRole('region', { name: 'Now' })).toHaveTextContent(
      '5 tasks cancelled · 1 done',
    );
  },
};

/** The confirmed Close runs: the facts stay, the button is busy, Cancel is off. */
export const Closing: Story = {
  args: { scenario: 'close-closing' },
  play: async ({ canvasElement }) => {
    const dialog = await openFromNow(canvasElement);
    await userEvent.click(await dialog.findByRole('button', { name: 'Close and archive' }));
    await expect(await dialog.findByRole('button', { name: 'Closing…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};
