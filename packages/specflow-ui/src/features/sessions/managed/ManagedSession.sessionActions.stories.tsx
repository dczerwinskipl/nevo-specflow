import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import { Environment, NARROW_VIEWPORT } from './managedSession.storyHelpers.stories-support';

/**
 * Session header "…" menu: Rename / Archive / Delete. Visual-only (the contract has no such
 * commands): the stories pass mock callbacks so the dialogs can be confirmed; the real route
 * leaves them unwired and the items render disabled (`DisabledInRoute`).
 */
const onRenameSession = fn();
const onArchiveSession = fn();
const onDeleteSession = fn();

const meta = {
  title: 'SpecFlow/Screens/Managed Session',
  component: ManagedSession,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
  args: {
    sessionId: fixtureSessionId,
    owner: 'actions-story',
    api: fixtureApi(sessionFixture()),
    onRenameSession,
    onArchiveSession,
    onDeleteSession,
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);

async function closeMenu() {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
}

async function openMenu(canvasElement: HTMLElement) {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Więcej akcji' }));
}

export const SessionActionsMenu: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    const items = await body().findAllByRole('menuitem');
    await expect(items.map((item) => item.textContent?.trim())).toEqual([
      'Zmień nazwę',
      'Archiwizuj',
      'Usuń',
    ]);
    await expect(items[2]?.className ?? '').toMatch(/error|danger|destructive/);
    await closeMenu();
  },
};

export const SessionRename: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    onRenameSession.mockClear();
    await openMenu(canvasElement);
    await userEvent.click(await body().findByRole('menuitem', { name: 'Zmień nazwę' }));
    const input = await body().findByRole('textbox', { name: 'Nazwa sesji' });
    await expect(input).toHaveValue('Sesja niezależna od specyfikacji');
    // Empty after trim: refused with a message, nothing saved.
    await userEvent.clear(input);
    await userEvent.type(input, '   {Enter}');
    await expect(await body().findByText('Podaj nazwę sesji.')).toBeVisible();
    await expect(onRenameSession).not.toHaveBeenCalled();
    // Too long (contract limit 256).
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('x'.repeat(257));
    await userEvent.keyboard('{Enter}');
    await expect(await body().findByText(/maksymalnie 256 znaków/)).toBeVisible();
    await expect(onRenameSession).not.toHaveBeenCalled();
    // Valid: Enter saves, the dialog closes and the header shows the new title.
    await userEvent.clear(input);
    await userEvent.type(input, '  Nowa nazwa  {Enter}');
    await waitFor(() => expect(onRenameSession).toHaveBeenCalledWith('Nowa nazwa'));
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull());
    await expect(
      await within(canvasElement).findByRole('heading', { name: 'Nowa nazwa' }),
    ).toBeVisible();
  },
};

export const SessionRenameCancel: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    onRenameSession.mockClear();
    await openMenu(canvasElement);
    await userEvent.click(await body().findByRole('menuitem', { name: 'Zmień nazwę' }));
    await userEvent.click(await body().findByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull());
    await expect(onRenameSession).not.toHaveBeenCalled();
  },
};

export const SessionArchive: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    onArchiveSession.mockClear();
    await openMenu(canvasElement);
    await userEvent.click(await body().findByRole('menuitem', { name: 'Archiwizuj' }));
    const dialog = await body().findByRole('alertdialog');
    await expect(within(dialog).getByText('Zarchiwizować tę sesję?')).toBeVisible();
    await expect(within(dialog).getByText(/historia zostanie zachowana/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
    await expect(onArchiveSession).not.toHaveBeenCalled();
    await openMenu(canvasElement);
    await userEvent.click(await body().findByRole('menuitem', { name: 'Archiwizuj' }));
    await userEvent.click(
      within(await body().findByRole('alertdialog')).getByRole('button', { name: 'Archiwizuj' }),
    );
    await waitFor(() => expect(onArchiveSession).toHaveBeenCalledOnce());
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
  },
};

export const SessionDelete: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    onDeleteSession.mockClear();
    await openMenu(canvasElement);
    await userEvent.click(await body().findByRole('menuitem', { name: 'Usuń' }));
    const dialog = await body().findByRole('alertdialog');
    await expect(within(dialog).getByText('Usunąć tę sesję?')).toBeVisible();
    await expect(within(dialog).getByText(/nie można cofnąć/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
    await expect(onDeleteSession).not.toHaveBeenCalled();
  },
};

export const SessionActionsNarrow: Story = {
  tags: ['contract'],
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    // The Context pill keeps the single direct slot; the menu holds the session actions.
    await expect(await canvas.findByRole('button', { name: 'Kontekst' })).toBeVisible();
    await openMenu(canvasElement);
    await expect(
      (await body().findAllByRole('menuitem')).map((i) => i.textContent?.trim()),
    ).toEqual(['Zmień nazwę', 'Archiwizuj', 'Usuń']);
    await closeMenu();
  },
};

/** The real route: no callbacks, so every session action is visible but disabled. */
export const SessionActionsDisabledInRoute: Story = {
  tags: ['contract'],
  args: { onRenameSession: undefined, onArchiveSession: undefined, onDeleteSession: undefined },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    for (const name of ['Zmień nazwę', 'Archiwizuj', 'Usuń']) {
      await expect(await body().findByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }

    await closeMenu();
  },
};
