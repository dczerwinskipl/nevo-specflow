import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WorkflowExecutionFixture } from '../ProjectWorkflowExecution.stories-support';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';

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

/** Opens the Specification's Activity history and returns it once its workflow entries are read. */
async function openSpecificationHistory(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const history = () => canvas.queryByRole('complementary', { name: 'Activity history' });
  // Beside Overview on a wide screen the history is open already; a narrow one opens its screen.
  await canvas.findByRole('region', { name: 'Now' }, wait);
  if (!history()) {
    const opened = await canvas
      .findByRole('complementary', { name: 'Activity history' }, { timeout: 3000 })
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

  const aside = await canvas.findByRole('complementary', { name: 'Activity history' }, wait);
  await waitFor(() => expect(aside.querySelector('[data-attempt-entry]')).not.toBeNull(), wait);

  return within(aside);
}

/** The Activity history beside Overview or on its stacked screen. */
function historyOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole('complementary', { name: 'Activity history' });
}

/** Each timeline entry by its title, with its outcome line when it has one, in order. */
function timelineOf(aside: HTMLElement): string[] {
  return Array.from(aside.querySelectorAll<HTMLElement>('li'))
    .filter((entry) => !entry.parentElement?.closest('li'))
    .map((entry) => {
      const heading = entry.querySelector('[role="heading"]');
      const outcome = entry.querySelector('[data-attempt-outcome]')?.textContent;
      const title = heading?.textContent ?? entry.textContent ?? '';

      return outcome ? `${title} · ${outcome}` : title;
    });
}

/** Neither the agent's name nor Open session wraps: one line each. */
async function expectActorLinesOnOneLine(aside: HTMLElement) {
  for (const line of Array.from(aside.querySelectorAll<HTMLElement>('[data-attempt-actor]'))) {
    const name = line.querySelector<HTMLElement>('span.truncate')!;
    await expect(name.textContent).toMatch(/^Claude · /);
    await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth);
    await expect(line.getBoundingClientRect().height).toBeLessThan(32);
  }
}

/*
 * The Specification's Activity history: one chronological timeline grouped by day, its agent's
 * attempts marked by how they ended, the owner's own attempt (handed back to the agent), a chat
 * Session outside the workflow with its "Session started", and "Specification created". The
 * Session an attempt already represents has no "Session started" of its own.
 */
export const SpecificationActivityHistory: Story = {
  args: { scenario: 'history-specification' },
  play: async ({ canvasElement }) => {
    const history = await openSpecificationHistory(canvasElement);
    await expect(history.getByText('Today')).toBeVisible();
    await expect(history.getByText('Yesterday')).toBeVisible();
    for (const outcome of [
      'Waiting for your confirmation',
      'Changes requested',
      'Completed',
      /^Taken over by /,
      'Handed to the agent',
      'Finished, but not committed',
      'Returned to Requirements',
    ]) {
      await expect(history.getByText(outcome)).toBeVisible();
    }

    await expect(history.getByText('Questions about the install matrix')).toBeVisible();
    await expect(history.getAllByText('Session started')).toHaveLength(1);
    await expect(history.getByText('Specification created')).toBeVisible();
    // No "Agent attempts" section of its own: one list.
    await expect(history.queryByText('Agent attempts')).toBeNull();

    // The change rows are collapsed; SpecFlow's own records are never one of them.
    await expect(history.getByRole('button', { name: '12 tasks' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(history.queryByText('specification.yaml')).toBeNull();
    await expect(history.getAllByText('05f9d80')[0]).toBeVisible();
    await expect(history.getAllByRole('link', { name: 'Open session' })[0]).toBeVisible();
    await expect(history.getByText(/^Result not accepted/)).toBeVisible();
    // The elapsed range only, never a duration.
    await expect(history.queryByText(/ min ·|\d h \d+ min/)).toBeNull();
  },
};

/** The same history with the Completed Breakdown's change rows and the first feedback open. */
export const SpecificationActivityHistoryExpanded: Story = {
  args: { scenario: 'history-specification' },
  play: async ({ canvasElement }) => {
    const history = await openSpecificationHistory(canvasElement);
    await userEvent.click(history.getByRole('button', { name: '12 tasks' }));
    await expect(
      history.getByRole('link', { name: 'End-to-end acceptance and roadmap coverage' }),
    ).toBeVisible();
    await expect(history.getByRole('button', { name: '8 more tasks' })).toBeVisible();
    await userEvent.click(history.getByRole('button', { name: '8 changed files' }));
    // A file by its name and folder, never the repeated Specification prefix.
    await expect(history.getByText('install-matrix.md')).toBeVisible();
    await expect(history.getByText('notes')).toBeVisible();
    await userEvent.click(history.getAllByRole('button', { name: '3 changed files' })[0]!);
    await expect(history.getAllByText('overview.md')[0]).toBeVisible();
    await userEvent.click(history.getAllByRole('button', { name: 'View feedback' })[0]!);
    await expect(history.getByText(/Install and init stay separate Tasks/)).toBeVisible();
  },
};

/**
 * nevo-2's history as the dogfood Runtime records it: seven agent attempts, the owner's Finish after
 * the take over and their Confirm of the second review, newest first in one list ending with
 * "Specification created"; no "Session started" rows (every Session is an attempt's). Every
 * committed attempt names what it changed; the agent reads "Claude · Opus 5.5" on one line, at
 * 375 px and beside Overview.
 */
export const Nevo2ActivityHistory: Story = {
  args: { scenario: 'history-nevo-2' },
  play: async ({ canvasElement }) => {
    for (const [width, height] of [
      [1440, 900],
      [375, 812],
    ] as const) {
      await settleViewport(width, height);
      const history = await openSpecificationHistory(canvasElement);
      await expect(timelineOf(historyOf(canvasElement))).toEqual([
        'Review the breakdown · Result confirmed',
        'Review the breakdown · Breakdown approved',
        'Break the solution down · Breakdown proposed',
        'Review the breakdown · Changes requested',
        'Break the solution down · Breakdown proposed',
        'Design the solution · Solution designed',
        expect.stringMatching(/^Design the solution · Taken over by /),
        'Write the Specification · Specification written',
        'Gather requirements · Requirements agreed',
        'Specification created',
      ]);
      await expect(history.queryByText('Session started')).toBeNull();
      await expect(history.getAllByRole('button', { name: /changed files?$/ })).toHaveLength(5);
      await expectActorLinesOnOneLine(historyOf(canvasElement));
    }
  },
};

/**
 * Continue with a note (owner, PR 169): the same Continue opens a small dialog with an optional note
 * for the agent; Continue keeps the focus, so without a note it is one more press. Checked at 375 px
 * and on desktop: the dialog fits, the label names the note, and the submit says it sends the note.
 */
export const ContinueWithNote: Story = {
  args: { scenario: 'attempt-stopped' },
  play: async ({ canvasElement }) => {
    for (const [width, height] of [
      [375, 812],
      [1440, 900],
    ] as const) {
      await settleViewport(width, height);
      const now = await findNow(canvasElement);
      await userEvent.click(within(now).getByRole('button', { name: 'Continue' }));
      const dialog = await within(document.body).findByRole('dialog', {}, wait);
      const submit = within(dialog).getByRole('button', { name: 'Continue' });
      await waitFor(() => expect(submit).toHaveFocus());
      const field = within(dialog).getByLabelText('Note for the agent (optional)');
      await userEvent.type(field, 'Run the tests one file at a time.');
      await expect(
        within(dialog).getByRole('button', { name: 'Continue with the note' }),
      ).toBeEnabled();
      const bounds = dialog.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(0);
      await expect(bounds.right).toBeLessThanOrEqual(width);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    }
  },
};
