import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WorkflowExecutionFixture } from '../ProjectWorkflowExecution.stories-support';

/*
 * Run with agent on the routed Full Task page: the Now block's second action and its start dialog,
 * once per answer the Runtime can give (`agentStart.stories-support`). Only the Runtime ports are
 * fakes; the dialog reads the check when it opens.
 */
const meta = {
  title: 'SpecFlow/Screens/Run with agent',
  component: WorkflowExecutionFixture,
  excludeStories: ['WorkflowExecutionFixture'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'agent-fresh' },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = { timeout: 10000 };

/** Opens the dialog from the Now block and waits for the Runtime's check to settle. */
async function openDialog(canvasElement: HTMLElement) {
  const now = await within(canvasElement).findByRole('region', { name: 'Now' }, wait);
  await userEvent.click(await within(now).findByRole('button', { name: 'Run with agent' }, wait));
  const dialog = await within(document.body).findByRole('dialog', {}, wait);
  await waitFor(() => expect(within(dialog).queryByText(/Checking whether/)).toBeNull(), wait);

  return dialog;
}

/** The footer holds Cancel and one primary action, never a third button. */
async function expectFooter(dialog: HTMLElement, primaryEnabled: boolean) {
  const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!;
  const buttons = within(footer).getAllByRole('button');
  await expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Run with agent']);
  if (primaryEnabled) {
    await expect(buttons[1]).toBeEnabled();
  } else {
    await expect(buttons[1]).toBeDisabled();
  }
}

/** Entry: Start step stays the main action; Run with agent is the one secondary. */
export const Entry: Story = {
  play: async ({ canvasElement }) => {
    const now = await within(canvasElement).findByRole('region', { name: 'Now' }, wait);
    const actions = await within(now).findAllByRole(
      'button',
      { name: /Start Implementation|Run with agent/ },
      wait,
    );
    await expect(actions.map((button) => button.textContent)).toEqual([
      'Start Implementation',
      'Run with agent',
    ]);
  },
};

/** A new Session: the agent tiles and the model, preselected from the role's settings. */
export const NewSession: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Run with agent: Implementation')).toBeVisible();
    await expect(await within(dialog).findByRole('radio', { name: /Claude/ }, wait)).toBeChecked();
    await expect(within(dialog).getByText('nevo-1/single-sign-on')).toBeVisible();
    // The work mode the Runtime names for this launch.
    await expect(
      within(dialog).getByText('The agent works in the Accept edits mode.'),
    ).toBeVisible();
    await expectFooter(dialog, true);
  },
};

/** The workflow continues the Session that did the step before: read-only, no picker. */
export const ContinuesSession: Story = {
  args: { scenario: 'agent-reuse' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Session')).toBeVisible();
    await expect(within(dialog).getByText('Continues')).toBeVisible();
    await expect(within(dialog).getByText('Implement token exchange')).toBeVisible();
    await expect(within(dialog).getByText(/Claude Sonnet · high/)).toBeVisible();
    await expect(within(dialog).queryByRole('radio')).toBeNull();
    await expectFooter(dialog, true);
  },
};

/** An independent step (a review) always starts in a new Session and says why. */
export const IndependentStep: Story = {
  args: { scenario: 'agent-independent' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Run with agent: Review')).toBeVisible();
    await expect(await within(dialog).findByText(/done independently/, {}, wait)).toBeVisible();
    await expectFooter(dialog, true);
  },
};

/** Changes SpecFlow cannot attribute: the paths, and Check again inside the alert. */
export const UncommittedChanges: Story = {
  args: { scenario: 'agent-dirty' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    const alert = within(dialog)
      .getByText('Commit or undo these changes first')
      .closest<HTMLElement>('[role=status]')!;
    await expect(within(alert).getByText('scratch-notes.txt')).toBeVisible();
    await expect(within(alert).getByRole('button', { name: 'Check again' })).toBeVisible();
    await expectFooter(dialog, false);
  },
};

/** The project names no agent and model for the role: never a preselected picker. */
export const NoAgentChosen: Story = {
  args: { scenario: 'agent-no-agent' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Agent and model not chosen')).toBeVisible();
    await expect(within(dialog).queryByRole('radio')).toBeNull();
    await expectFooter(dialog, false);
  },
};

/**
 * The agent the workflow chose is not ready: the Runtime's own words, the tile marked, and picking a
 * ready agent (a new Session may; the start checks it again) enables the start.
 */
export const ProviderNotReady: Story = {
  args: { scenario: 'agent-provider-not-ready' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText(/not signed in on this machine/)).toBeVisible();
    await expectFooter(dialog, false);
    const claude = await within(dialog).findByRole('radio', { name: /Claude/ }, wait);
    await expect(claude).toBeChecked();
    await expect(
      within(claude.closest('label') ?? dialog).getByText('Sign-in needed'),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Codex/ }));
    await waitFor(() => expectFooter(dialog, true), wait);
  },
};

/**
 * The role's settings name a model the agent does not offer: the model is not chosen ("Choose a
 * model", the configured id never shown) and Start waits until one of the agent's models is picked.
 */
export const ModelNotOffered: Story = {
  args: { scenario: 'agent-model-not-offered' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    const trigger = await within(dialog).findByRole('button', { name: /Choose a model/ }, wait);
    await expect(within(dialog).getByText(/No model Claude offers is set/)).toBeVisible();
    await expect(within(dialog).queryByText(/\bsonnet\b/)).toBeNull();
    await expectFooter(dialog, false);
    await userEvent.click(trigger);
    await userEvent.click(
      await within(document.body).findByRole('menuitemradio', { name: /Claude Sonnet/ }, wait),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expectFooter(dialog, true), wait);
  },
};

/** The Session to continue no longer exists; SpecFlow does not start another in its place. */
export const SessionUnavailable: Story = {
  args: { scenario: 'agent-session-gone' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('This session no longer exists.')).toBeVisible();
    await expectFooter(dialog, false);
  },
};

/** The checkout changed after the check: the refused start shows the same blocker as an alert. */
export const RefusedOnSubmit: Story = {
  args: { scenario: 'agent-refused' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run with agent' }));
    const alert = await within(dialog).findByRole('alert', {}, wait);
    await expect(within(alert).getByText('Commit or undo these changes first')).toBeVisible();
    // Focus moves to the alert's Check again: it never drops to the page behind the dialog.
    await waitFor(
      () => expect(within(alert).getByRole('button', { name: 'Check again' })).toHaveFocus(),
      wait,
    );
    await expectFooter(dialog, false);
  },
};
