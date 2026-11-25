import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WorkflowExecutionFixture } from '../ProjectWorkflowExecution.stories-support';

/*
 * The Now block while an agent runs a step and after it stops, once per state the Runtime can report
 * (`agentAttempt.stories-support`), on the routed Full Task page (the Specification Overview for the
 * result that waits for the owner). Only the Runtime ports are fakes. Each story checks the position
 * line, the note that explains the state and the actions: the main action and at most one secondary,
 * never three buttons in one row.
 */
const meta = {
  title: 'SpecFlow/Screens/Agent attempt',
  component: WorkflowExecutionFixture,
  excludeStories: ['WorkflowExecutionFixture'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'attempt-working' },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = { timeout: 10000 };

async function findNow(canvasElement: HTMLElement) {
  return within(canvasElement).findByRole('region', { name: 'Now' }, wait);
}

/** The labels of the action row's buttons, in order. */
function actionsOf(now: HTMLElement) {
  const row = now.querySelector('[data-slot="workflow-actions"]');

  return Array.from(row?.querySelectorAll('button') ?? []).map((button) => button.textContent);
}

/** Running: the Session in the position line and Stop agent as the one action. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(await within(now).findByText(/agent working since/, {}, wait)).toBeVisible();
    await expect(
      await within(now).findByRole('link', { name: 'Implement token exchange' }, wait),
    ).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Stop agent']);
  },
};

/** Stopping: the step stays locked until the process is proven ended; nothing says "stopped" yet. */
/**
 * The agent's Turn waits for the owner's answer to a question in its Session: the note says so and
 * the main action opens the Session, never "nothing to do" (dogfood #189).
 */
export const WaitingForOwner: Story = {
  args: { scenario: 'attempt-waiting-for-owner' },
  play: async ({ canvasElement }) => {
    const now = await within(canvasElement).findByRole('region', { name: 'Now' });
    await expect(
      await within(now).findByText(/The agent is waiting for you: it asked a question/),
    ).toBeVisible();
    await expect(within(now).queryByText(/You do not need to do anything/)).toBeNull();
    await expect(within(now).getByRole('button', { name: 'Answer the question' })).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Stop agent' })).toBeVisible();
  },
};

export const Stopping: Story = {
  args: { scenario: 'attempt-stopping' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(await within(now).findByText(/stopping the agent/, {}, wait)).toBeVisible();
    await expect(within(now).getByText(/stays locked until SpecFlow sees/)).toBeVisible();
    const stopping = within(now).getByRole('button', { name: 'Stopping…' });
    await expect(stopping).toBeDisabled();
    await expect(stopping).toHaveAttribute('aria-busy', 'true');
    await expect(within(now).queryByText(/stopped/)).toBeNull();
  },
};

/** A Return during the attempt waits for the agent to stop: nothing to click, and why. */
export const ReturnRequested: Story = {
  args: { scenario: 'attempt-return-requested' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/return requested · waiting for the agent to stop/, {}, wait),
    ).toBeVisible();
    await expect(within(now).getByText(/only once its process has ended/)).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Returning…']);
  },
};

/** The agent could not be stopped: the return keeps waiting and Stop again is the action. */
export const ReturnStopFailed: Story = {
  args: { scenario: 'attempt-return-stop-failed' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(await within(now).findByRole('alert', {}, wait)).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Stop again']);
  },
};

/** Take over: the dialog says the agent's files stay uncommitted and lists them. */
export const TakeOver: Story = {
  args: { scenario: 'attempt-stopped' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await userEvent.click(await within(now).findByRole('button', { name: 'Take over' }, wait));
    const dialog = await within(document.body).findByRole('dialog', {}, wait);
    await expect(within(dialog).getByText('Take over Implementation')).toBeVisible();
    await expect(within(dialog).getByText('The agent’s work stays')).toBeVisible();
    await expect(within(dialog).getByText('src/auth/refresh.ts')).toBeVisible();
    const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!;
    await expect(
      within(footer)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Take over']);
  },
};

/** Outcome unknown: a danger note, and Check outcome as the main action. */
export const OutcomeUnknown: Story = {
  args: { scenario: 'attempt-unknown' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(
      within(alert).getByText(/cannot tell whether the agent is still working/),
    ).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Check outcome']);
  },
};

/** The attempt started but its Session was never created: Continue reads Retry start. */
export const SessionMissing: Story = {
  args: { scenario: 'attempt-session-missing' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(await within(now).findByText(/the agent did not start/, {}, wait)).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Retry start', 'Take over']);
  },
};

/** Ended without a result: what Continue does, and Continue as the main action. */
export const EndedWithoutResult: Story = {
  args: { scenario: 'attempt-stopped' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/stopped without a result at/, {}, wait),
    ).toBeVisible();
    await expect(
      within(now).getByText('The agent stopped without proposing a result.'),
    ).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Continue', 'Take over']);
    await expect(within(now).getByRole('button', { name: 'Continue' })).toBeEnabled();
  },
};

/** The agent's result was not accepted: one reason per line, in plain words. */
export const ProposalRefused: Story = {
  args: { scenario: 'attempt-refused' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(
      within(alert).getByText(
        /The agent proposed Ready for review, and SpecFlow did not accept it/,
      ),
    ).toBeVisible();
    await expect(within(alert).getByText('specs/active/single-sign-on/notes.md')).toBeVisible();
    await expect(within(alert).getByText(/Give it a type or delete it/)).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Continue' })).toBeEnabled();
  },
};

/** Files changed between the Turns: shown before the click, with Continue disabled. */
export const ContinueRefusedFilesChanged: Story = {
  args: { scenario: 'attempt-continue-refused' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(
      within(alert).getByText('The agent cannot continue: 2 files changed since it stopped.'),
    ).toBeVisible();
    await expect(within(alert).getByText('src/auth/refresh.ts')).toBeVisible();
    await expect(within(alert).getByText(/never counts someone else’s edits/)).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Continue' })).toBeDisabled();
  },
};

/** The Session the attempt ran in no longer exists: Continue is refused and says why. */
export const SessionGone: Story = {
  args: { scenario: 'attempt-session-gone' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/its session no longer exists/, {}, wait),
    ).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Continue' })).toBeDisabled();
  },
};

/** The agent's result waits for the owner: the proposal, what Confirm applies, Confirm and Reject. */
export const ConfirmationPending: Story = {
  args: { scenario: 'attempt-confirmation' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/Waiting for your confirmation/, {}, wait),
    ).toBeVisible();
    await expect(within(now).getByText('Tasks approved')).toBeVisible();
    await expect(
      within(now).getByText(/Confirming approves the 5 draft tasks \(t-01 to t-05\)/),
    ).toBeVisible();
    await expect(actionsOf(now)).toEqual(['Confirm', 'Reject']);
  },
};

/** Reject needs the owner's feedback before it can be sent. */
export const ConfirmationReject: Story = {
  args: { scenario: 'attempt-confirmation' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await userEvent.click(await within(now).findByRole('button', { name: 'Reject' }, wait));
    const dialog = await within(document.body).findByRole('dialog', {}, wait);
    await expect(within(dialog).getByText('Reject the agent’s result')).toBeVisible();
    const reject = within(dialog).getByRole('button', { name: 'Reject' });
    await expect(reject).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox'), 'Split the audit log task.');
    await waitFor(() => expect(reject).toBeEnabled());
  },
};

/*
 * The Task's history after the owner took Implementation over: the agent's attempt says how it
 * ended, lists what it kept (documents linked, files) and its Session; its events open on request.
 */
export const TakenOverWithHistory: Story = {
  args: { scenario: 'history-taken-over' },
  play: async ({ canvasElement }) => {
    await findNow(canvasElement);
    const [history] = await within(canvasElement).findAllByRole(
      'button',
      { name: /history/i },
      wait,
    );
    await userEvent.click(history!);
    const attempt = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLElement>('[data-agent-attempt="taken-over"]');
      if (!found) {
        throw new Error('The agent attempt is not shown yet');
      }

      return within(found);
    }, wait);
    await expect(attempt.getByText(/^Taken over by /)).toBeVisible();
    await expect(attempt.getByText(/The agent stopped without a result at/)).toBeVisible();
    // What it kept, collapsed: the documents by name, the other files by name and folder.
    await userEvent.click(attempt.getByRole('button', { name: '5 changed files' }));
    await expect(attempt.getByRole('button', { name: 'task.md' })).toBeVisible();
    await expect(attempt.getByText('refresh.ts')).toBeVisible();
    await expect(attempt.getByText('Kept in the checkout, not committed')).toBeVisible();
    // What was achieved, not the lifecycle the Engine recorded.
    await expect(attempt.queryByText('The agent stopped')).toBeNull();
  },
};

/*
 * The step after an agent finished: the commit it made when it finished (read from the workflow
 * history), or why it failed and Retry commit inside the note.
 */
export const FinishedCommitted: Story = {
  args: { scenario: 'finished-committed' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    // One line of the Last hand-off: what was committed and the commit's short id.
    await expect(
      await within(now).findByText('2 documents and 3 files committed · 3f9a1c7', {}, wait),
    ).toBeVisible();
  },
};

/*
 * Another subject's agent holds the project. Its outcome unknown: the Overview says nothing can be
 * saved, links the holding Task and its Session, and offers no action of its own.
 */
export const HoldOutcomeUnknownOnOtherSubject: Story = {
  args: { scenario: 'hold-outcome-unknown' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(
      within(alert).getByText('Nothing can be saved in this project right now.'),
    ).toBeVisible();
    await expect(
      within(alert).getByRole('link', { name: 'Token exchange endpoint and session cookie' }),
    ).toBeVisible();
    await expect(
      within(alert).getByRole('link', { name: 'Implement token exchange' }),
    ).toBeVisible();
    await expect(actionsOf(now)).toEqual([]);
  },
};

/** While the agent merely works, a lighter note where this block has an action that would wait. */
export const HoldWorkingOnOtherSubject: Story = {
  args: { scenario: 'hold-working' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/An agent is working in this project/, {}, wait),
    ).toBeVisible();
    await expect(within(now).queryByRole('alert')).toBeNull();
    await expect(within(now).getByRole('button', { name: 'Finish step' })).toBeEnabled();
  },
};

/*
 * The commit of the finished attempt failed, or is still being made: one notice on the block says
 * nothing of the workflow can change until it is committed, with Start and Run with agent disabled;
 * Retry commit inside it (a pending commit offers it once it stalls).
 */
export const FinishedCommitFailed: Story = {
  args: { scenario: 'finished-commit-failed' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(within(alert).getByText('COMMIT_BLOCKED')).toBeVisible();
    await expect(
      within(alert).getByText(/nothing in this specification’s workflow can change/),
    ).toBeVisible();
    await expect(within(alert).getByRole('button', { name: 'Retry commit' })).toBeVisible();
    await expect(within(now).getByRole('button', { name: /^Start/ })).toBeDisabled();
    await expect(within(now).getByRole('button', { name: 'Run with agent' })).toBeDisabled();
  },
};

export const FinishedCommitPending: Story = {
  args: { scenario: 'finished-commit-pending' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/SpecFlow is committing its work/, {}, wait),
    ).toBeVisible();
    await expect(within(now).getByRole('button', { name: /^Start/ })).toBeDisabled();
    await expect(within(now).getByRole('button', { name: 'Run with agent' })).toBeDisabled();
    await expect(within(now).queryByRole('button', { name: 'Retry commit' })).toBeNull();
    const retry = await within(now).findByRole(
      'button',
      { name: 'Retry commit' },
      { timeout: 20000 },
    );
    await expect(retry).toBeEnabled();
  },
};

/*
 * The agent's result waiting for the owner, with the commit of its work (made when it finished):
 * committed (its short id and files), still running (Confirm and Reject wait, the block keeps
 * reading, and Retry commit is offered once it stays pending), or failed (why, and Retry commit
 * inside the note; Confirm and Reject wait).
 */
export const ConfirmationCommitted: Story = {
  args: { scenario: 'attempt-confirmation', confirmationCommit: 'committed' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    // The agent's result names what its commit holds and the commit's short id, on one line.
    await expect(
      await within(now).findByText('7 documents committed · 3f9c2a1', {}, wait),
    ).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Confirm' })).toBeEnabled();
  },
};

export const ConfirmationCommitPending: Story = {
  args: { scenario: 'attempt-confirmation', confirmationCommit: 'pending' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    await expect(
      await within(now).findByText(/SpecFlow is committing its work/, {}, wait),
    ).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await expect(within(now).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await expect(actionsOf(now)).toEqual(['Confirm', 'Reject']);
    // It stays pending (an interruption): Retry commit is offered in the note, as after a failure.
    await expect(within(now).queryByRole('button', { name: 'Retry commit' })).toBeNull();
    const retry = await within(now).findByRole(
      'button',
      { name: 'Retry commit' },
      { timeout: 20000 },
    );
    await expect(retry).toBeEnabled();
    await expect(within(now).getByText(/The commit has not finished/)).toBeVisible();
  },
};

export const ConfirmationCommitFailed: Story = {
  args: { scenario: 'attempt-confirmation', confirmationCommit: 'failed' },
  play: async ({ canvasElement }) => {
    const now = await findNow(canvasElement);
    const alert = await within(now).findByRole('alert', {}, wait);
    await expect(within(alert).getByText(/the branch is protected/)).toBeVisible();
    await expect(
      within(alert).getByText(
        /Confirm and Reject become possible once the agent’s work is committed/,
      ),
    ).toBeVisible();
    await expect(within(alert).getByRole('button', { name: 'Retry commit' })).toBeVisible();
    await expect(within(now).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await expect(within(now).getByRole('button', { name: 'Reject' })).toBeDisabled();
  },
};

/** Opens the Specification's Activity history and returns its Agent attempts section. */
async function openSpecificationHistory(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  // Beside Overview on a wide screen the history is open already; a narrow one opens its screen.
  await canvas.findByRole('region', { name: 'Now' }, wait);
  if (!canvas.queryByRole('region', { name: 'Agent attempts' })) {
    const opened = await canvas
      .findByRole('region', { name: 'Agent attempts' }, { timeout: 3000 })
      .catch(() => undefined);
    const direct = canvas.queryByRole('button', { name: 'Activity history' });
    if (opened) {
      // Open beside Overview already.
    } else if (direct) {
      await userEvent.click(direct);
    } else {
      // On a phone the history is one of the header's More actions.
      await userEvent.click(canvas.getAllByRole('button', { name: 'More actions' })[0]!);
      await userEvent.click(
        await within(document.body).findByRole('menuitem', { name: 'Activity history' }),
      );
    }
  }

  return within(await canvas.findByRole('region', { name: 'Agent attempts' }, wait));
}

/*
 * The Specification's Activity history: its agent's attempts grouped by day, each marked by how it
 * ended (waiting for confirmation, changes requested, completed, taken over, commit failed,
 * returned), titled by its step, with its outcome, time and attempt, the agent, compact change rows
 * (changed files, Tasks by title: collapsed) and its commit; Open session on the agent's line and
 * View feedback name the detail. Lifecycle events and SpecFlow's own records are not shown.
 */
export const SpecificationActivityHistory: Story = {
  args: { scenario: 'history-specification' },
  play: async ({ canvasElement }) => {
    const attempts = await openSpecificationHistory(canvasElement);
    await expect(attempts.getByText('Today')).toBeVisible();
    await expect(attempts.getByText('Yesterday')).toBeVisible();
    for (const outcome of [
      'Waiting for your confirmation',
      'Changes requested',
      'Completed',
      /^Taken over by /,
      'Finished, but not committed',
      'Returned to Requirements',
    ]) {
      await expect(attempts.getByText(outcome)).toBeVisible();
    }

    // The change rows are collapsed; SpecFlow's own records are never one of them.
    await expect(attempts.getByRole('button', { name: '12 tasks' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(attempts.queryByText('specification.yaml')).toBeNull();
    await expect(attempts.getAllByText('05f9d80')[0]).toBeVisible();
    await expect(attempts.getAllByRole('link', { name: 'Open session' })[0]).toBeVisible();
    await expect(attempts.getByText(/^Result not accepted/)).toBeVisible();
  },
};

/** The same history with the Completed Breakdown's change rows and the first feedback open. */
export const SpecificationActivityHistoryExpanded: Story = {
  args: { scenario: 'history-specification' },
  play: async ({ canvasElement }) => {
    const attempts = await openSpecificationHistory(canvasElement);
    await userEvent.click(attempts.getByRole('button', { name: '12 tasks' }));
    await expect(
      attempts.getByRole('link', { name: 'End-to-end acceptance and roadmap coverage' }),
    ).toBeVisible();
    await expect(attempts.getByRole('button', { name: '8 more tasks' })).toBeVisible();
    await userEvent.click(attempts.getByRole('button', { name: '8 changed files' }));
    // A file by its name and folder, never the repeated Specification prefix.
    await expect(attempts.getByText('install-matrix.md')).toBeVisible();
    await expect(attempts.getByText('notes')).toBeVisible();
    await userEvent.click(attempts.getAllByRole('button', { name: '3 changed files' })[0]!);
    await expect(attempts.getAllByText('overview.md')[0]).toBeVisible();
    await userEvent.click(attempts.getAllByRole('button', { name: 'View feedback' })[0]!);
    await expect(attempts.getByText(/Install and init stay separate Tasks/)).toBeVisible();
  },
};
