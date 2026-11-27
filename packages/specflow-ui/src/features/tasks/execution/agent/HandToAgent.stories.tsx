import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WorkflowExecutionFixture } from '../ProjectWorkflowExecution.stories-support';

/*
 * Hand to agent on the routed Full Task page: the owner holds their own rework attempt of
 * Implementation and hands it to the agent. The Now block offers it beside Finish step and says so
 * in its who-acts line; the dialog is Run with agent's, read from the Runtime's check.
 */
const meta = {
  title: 'SpecFlow/Screens/Hand to agent',
  component: WorkflowExecutionFixture,
  excludeStories: ['WorkflowExecutionFixture'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'hand-fresh' },
} satisfies Meta<typeof WorkflowExecutionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = { timeout: 10000 };

async function openDialog(canvasElement: HTMLElement) {
  const now = await within(canvasElement).findByRole('region', { name: 'Now' }, wait);
  await userEvent.click(await within(now).findByRole('button', { name: 'Hand to agent' }, wait));
  const dialog = await within(document.body).findByRole('dialog', {}, wait);
  await waitFor(() => expect(within(dialog).queryByText(/Checking whether/)).toBeNull(), wait);

  return dialog;
}

/** Finish step stays the main action; Hand to agent is the one secondary. */
export const Entry: Story = {
  play: async ({ canvasElement }) => {
    const now = await within(canvasElement).findByRole('region', { name: 'Now' }, wait);
    const actions = await within(now).findAllByRole(
      'button',
      { name: /^(Finish step|Hand to agent)$/ },
      wait,
    );
    await expect(actions.map((button) => button.textContent)).toEqual([
      'Finish step',
      'Hand to agent',
    ]);
    await expect(within(now).getByText(/or hand it to the agent/)).toBeVisible();
  },
};

/** The dialog says the owner's attempt ends and the agent goes on in a new attempt. */
export const Dialog: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Hand to agent: Implementation')).toBeVisible();
    await expect(within(dialog).getByText(/Your attempt 2 of this step/)).toBeVisible();
    const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!;
    const buttons = within(footer).getAllByRole('button');
    await expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Hand to agent']);
    await expect(buttons[1]).toBeEnabled();
  },
};

/** The owner's changes are not committed: named before anything is sent, the hand disabled. */
export const OwnerWorkUncommitted: Story = {
  args: { scenario: 'hand-owner-work' },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await expect(within(dialog).getByText('Commit or undo your changes first')).toBeVisible();
    await expect(within(dialog).getByText('src/auth/refresh.ts')).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Hand to agent' })).toBeDisabled();
  },
};
