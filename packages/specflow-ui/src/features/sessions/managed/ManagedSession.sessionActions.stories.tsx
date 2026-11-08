import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ApiError } from '../../../api';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  Environment,
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
} from './managedSession.storyHelpers.stories-support';
import { archivedSnapshot } from './sessionActions/sessionActions.stories-support';
import { scriptedFixture, scriptedRender } from './sessionActions/scriptedSession.stories-support';

/**
 * Session header "…" menu: Rename / Archive (Restore) / Delete on the real commands
 * (session-actions-ux §3). Each story scripts the Runtime's answers; a successful command's
 * `session` change arrives on the stream, as in the product.
 */
const onSessionDeleted = fn();
const onNewSession = fn();

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
    onSessionDeleted,
    onNewSession,
  },
  render: scriptedRender(sessionFixture),
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

async function choose(canvasElement: HTMLElement, item: string) {
  await openMenu(canvasElement);
  await userEvent.click(await body().findByRole('menuitem', { name: item }));
}

const menuLabels = async () =>
  (await body().findAllByRole('menuitem')).map((item) => item.textContent?.trim());

const withCapabilities =
  (capabilities: Partial<SessionSnapshot['session']['capabilities']>) => () => {
    const snapshot = sessionFixture();

    return {
      ...snapshot,
      session: {
        ...snapshot.session,
        capabilities: { ...snapshot.session.capabilities, ...capabilities },
      },
    };
  };

const withTurn =
  (state: NonNullable<SessionSnapshot['activeTurn']>['state']) => (): SessionSnapshot => ({
    ...sessionFixture(),
    activeTurn: {
      turnId: '00000000-0000-4000-8000-0000000000b1',
      state,
      revision: 2,
      startedAt: '2026-10-25T10:01:00Z',
    },
  });

export const SessionActionsMenu: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    await expect(await menuLabels()).toEqual(['Zmień nazwę', 'Archiwizuj', 'Usuń']);
    const items = await body().findAllByRole('menuitem');
    await expect(items[2]?.className ?? '').toMatch(/error|danger|destructive/);
    await closeMenu();
  },
};

/** Manage without delete: Delete is omitted, not disabled. */
export const SessionActionsManageOnly: Story = {
  tags: ['contract'],
  render: scriptedRender(withCapabilities({ delete: false })),
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    await expect(await menuLabels()).toEqual(['Zmień nazwę', 'Archiwizuj']);
    await closeMenu();
  },
};

export const SessionActionsDeleteOnly: Story = {
  tags: ['contract'],
  render: scriptedRender(withCapabilities({ manage: false, delete: true })),
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    await expect(await menuLabels()).toEqual(['Usuń']);
    await closeMenu();
  },
};

/** Neither capability: no items, so no "…" menu at all. */
export const SessionActionsNone: Story = {
  tags: ['contract'],
  render: scriptedRender(withCapabilities({ manage: false, delete: false })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'Sesja niezależna od specyfikacji' });
    await expect(canvas.queryByRole('button', { name: 'Więcej akcji' })).toBeNull();
  },
};

export const SessionRename: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'Zmień nazwę');
    const input = await body().findByRole('textbox', { name: 'Nazwa sesji' });
    await expect(input).toHaveValue('Sesja niezależna od specyfikacji');
    // Empty after trim: refused with a message, nothing sent.
    await userEvent.clear(input);
    await userEvent.type(input, '   {Enter}');
    await expect(await body().findByText('Podaj nazwę sesji.')).toBeVisible();
    // Too long (contract limit 256).
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste('x'.repeat(257));
    await userEvent.keyboard('{Enter}');
    await expect(await body().findByText(/maksymalnie 256 znaków/)).toBeVisible();
    await expect(scriptedFixture().calls.rename).toHaveLength(0);
    // Valid: saved, the dialog closes and the header shows the title from the `session` change.
    await userEvent.clear(input);
    await userEvent.type(input, '  Nowa nazwa  {Enter}');
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull());
    await expect(scriptedFixture().calls.rename[0]).toMatchObject({ title: 'Nowa nazwa' });
    await expect(
      await within(canvasElement).findByRole('heading', { name: 'Nowa nazwa' }),
    ).toBeVisible();
  },
};

/** A lost answer keeps the dialog locked (input, Cancel, Escape); the retry reuses the key. */
export const SessionRenameUnconfirmed: Story = {
  tags: ['contract'],
  render: scriptedRender(sessionFixture, { rename: ['lost', 'ok'] }),
  play: async ({ canvasElement }) => {
    await choose(canvasElement, 'Zmień nazwę');
    const input = await body().findByRole('textbox', { name: 'Nazwa sesji' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Przegląd{Enter}');
    const dialog = await body().findByRole('dialog');
    await expect(
      await within(dialog).findByText('Nie potwierdzono operacji. Spróbuj ponownie.'),
    ).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(body().getByRole('dialog')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull());
    const [first, retry] = scriptedFixture().calls.rename as { requestId: string }[];
    await expect(retry?.requestId).toBe(first?.requestId);
    await expect(
      await within(canvasElement).findByRole('heading', { name: 'Przegląd' }),
    ).toBeVisible();
  },
};

/** Archive: confirmed, then the archived bar replaces the Composer and Restore replaces Archive. */
export const SessionArchive: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await choose(canvasElement, 'Archiwizuj');
    const dialog = await body().findByRole('alertdialog');
    await expect(within(dialog).getByText('Zarchiwizować tę sesję?')).toBeVisible();
    await expect(within(dialog).getByText(/historia, praca i zużycie pozostaną/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
    await expect(scriptedFixture().calls.archive).toHaveLength(0);
    await choose(canvasElement, 'Archiwizuj');
    await userEvent.click(
      within(await body().findByRole('alertdialog')).getByRole('button', { name: 'Archiwizuj' }),
    );
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
    await expect(
      await canvas.findByText('Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(canvas.getByText(/^Zarchiwizowana( ·|$)/)).toBeVisible();
    await openMenu(canvasElement);
    await expect(await menuLabels()).toEqual(['Zmień nazwę', 'Przywróć', 'Usuń']);
    await closeMenu();
  },
};

const archiveBlocked = (note: string): Story['play'] =>
  async function play({ canvasElement }) {
    await choose(canvasElement, 'Archiwizuj');
    const dialog = await body().findByRole('alertdialog');
    await expect(within(dialog).getByText(note)).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Archiwizuj' })).toBeDisabled();
    await expect(scriptedFixture().calls.archive).toHaveLength(0);
  };

export const SessionArchiveActiveTurn: Story = {
  tags: ['contract'],
  render: scriptedRender(withTurn('active')),
  play: archiveBlocked('Trwa tura. Zatrzymaj ją lub poczekaj na jej zakończenie.'),
};

export const SessionArchiveWaitingForUser: Story = {
  tags: ['contract'],
  render: scriptedRender(() => sessionFixture(true)),
  play: archiveBlocked('Tura czeka na Twoją odpowiedź. Odpowiedz lub zatrzymaj turę.'),
};

export const SessionArchiveUnknownTurn: Story = {
  tags: ['contract'],
  render: scriptedRender(withTurn('unknown')),
  play: archiveBlocked('Najpierw ustal wynik ostatniej tury.'),
};

/** Archived with Manage, Wide: the quiet bar with Restore in the Composer's place. */
export const ArchivedSession: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  render: scriptedRender(() => archivedSnapshot()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Przywróć' })).toBeVisible();
    await expect(canvas.getByText(/^Zarchiwizowana( ·|$)/)).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
  },
};

export const ArchivedSessionNarrow: Story = {
  tags: ['contract'],
  globals: NARROW_VIEWPORT,
  render: scriptedRender(() => archivedSnapshot()),
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const bar = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('[data-archived-bar]');
      if (!node) {
        throw new Error('No archived bar');
      }

      return node;
    });
    await expect(within(bar).getByRole('button', { name: 'Przywróć' })).toBeVisible();
    // Fits the phone width.
    await expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(390);
  },
};

/** Without Manage: the note alone, no Restore, and no menu items for it. */
export const ArchivedSessionWithoutManage: Story = {
  tags: ['contract'],
  render: scriptedRender(() => {
    const snapshot = archivedSnapshot(false);

    return {
      ...snapshot,
      session: {
        ...snapshot.session,
        capabilities: { ...snapshot.session.capabilities, delete: false },
      },
    };
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Przywróć' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Więcej akcji' })).toBeNull();
  },
};

/** Restore: pending, an unconfirmed attempt, the retry, then the Composer returns with focus. */
export const ArchivedSessionRestore: Story = {
  tags: ['contract'],
  render: scriptedRender(() => archivedSnapshot(), { unarchive: ['lost', 'hold'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Przywróć' }));
    await expect(
      await canvas.findByText('Nie potwierdzono operacji. Spróbuj ponownie.'),
    ).toBeVisible();
    // The retry: pending keeps focus on the control and ignores further presses.
    await userEvent.click(canvas.getByRole('button', { name: 'Przywróć' }));
    const pending = await canvas.findByRole('button', { name: 'Przywracanie…' });
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    await expect(pending).toHaveFocus();
    await userEvent.click(pending);
    await expect(scriptedFixture().calls.unarchive).toHaveLength(2);
    const [lost, retry] = scriptedFixture().calls.unarchive as { requestId: string }[];
    await expect(retry?.requestId).toBe(lost?.requestId);
    scriptedFixture().release();
    const editor = await canvas.findByRole('textbox', { name: 'Wiadomość' });
    await waitFor(() => expect(editor).toHaveFocus());
  },
};

/** Archived in another view: the send is refused as final, with its own note, then the bar. */
export const SendRefusedArchived: Story = {
  tags: ['contract'],
  render: scriptedRender(sessionFixture, { start: [{ status: 409, code: 'SESSION_ARCHIVED' }] }),
  args: { owner: 'actions-story-archived-send' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Wiadomość' });
    await userEvent.type(editor, 'Uruchom testy');
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await expect(await canvas.findByText('Sesja została zarchiwizowana.')).toBeVisible();
    await expect(
      canvas.queryByText('Nie potwierdzono żądania. Ponów je z tym samym kluczem.'),
    ).toBeNull();
    // Not retained: Send, not "Retry sending".
    await expect(canvas.queryByRole('button', { name: 'Ponów wysyłanie' })).toBeNull();
    await expect(editor).toHaveValue('Uruchom testy');
    const session = archivedSnapshot().session;
    scriptedFixture().pushChange({ kind: 'session', changes: { session } });
    await expect(
      await canvas.findByText('Sesja jest zarchiwizowana. Nie można w niej wysyłać wiadomości.'),
    ).toBeVisible();
    await expect(canvas.queryByText('Sesja została zarchiwizowana.')).toBeNull();
  },
};

export const SessionDelete: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    onSessionDeleted.mockClear();
    await choose(canvasElement, 'Usuń');
    const dialog = await body().findByRole('alertdialog');
    await expect(within(dialog).getByText('Usunąć tę sesję?')).toBeVisible();
    await expect(within(dialog).getByText('Sesja niezależna od specyfikacji')).toBeVisible();
    await expect(within(dialog).getByText(/nie można cofnąć/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(body().queryByRole('alertdialog')).toBeNull());
    await expect(scriptedFixture().calls.delete).toHaveLength(0);
    await choose(canvasElement, 'Usuń');
    await userEvent.click(
      within(await body().findByRole('alertdialog')).getByRole('button', { name: 'Usuń' }),
    );
    await waitFor(() => expect(onSessionDeleted).toHaveBeenCalledOnce());
  },
};

/** Pending: the dialog is locked and the confirm keeps focus while it ignores presses. */
export const SessionDeletePending: Story = {
  tags: ['contract'],
  render: scriptedRender(sessionFixture, { delete: ['hold'] }),
  play: async ({ canvasElement }) => {
    onSessionDeleted.mockClear();
    await choose(canvasElement, 'Usuń');
    const dialog = await body().findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
    const pending = await within(dialog).findByRole('button', { name: 'Usuwanie…' });
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    await expect(pending).toHaveFocus();
    await expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toBeDisabled();
    await userEvent.click(pending);
    await expect(scriptedFixture().calls.delete).toHaveLength(1);
    scriptedFixture().release();
    await waitFor(() => expect(onSessionDeleted).toHaveBeenCalledOnce());
  },
};

/** Unconfirmed (locked), then the retry answers 404: the first attempt had deleted it — done. */
export const SessionDeleteLostThenNotFound: Story = {
  tags: ['contract'],
  render: scriptedRender(sessionFixture, {
    delete: ['lost', { status: 404, code: 'SESSION_NOT_FOUND' }],
  }),
  play: async ({ canvasElement }) => {
    onSessionDeleted.mockClear();
    await choose(canvasElement, 'Usuń');
    const dialog = await body().findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
    await expect(
      await within(dialog).findByText('Nie potwierdzono operacji. Spróbuj ponownie.'),
    ).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(body().getByRole('alertdialog')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
    await waitFor(() => expect(onSessionDeleted).toHaveBeenCalledOnce());
    await expect(scriptedFixture().calls.delete).toHaveLength(2);
  },
};

/** Unsettled repository operations: a definite refusal; Cancel unlocks, confirm stays enabled. */
export const SessionDeleteBlocked: Story = {
  tags: ['contract'],
  render: scriptedRender(sessionFixture, {
    delete: [{ status: 409, code: 'SESSION_DELETE_BLOCKED' }],
  }),
  play: async ({ canvasElement }) => {
    onSessionDeleted.mockClear();
    await choose(canvasElement, 'Usuń');
    const dialog = await body().findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usuń' }));
    await expect(
      await within(dialog).findByText(
        'Sesja ma nierozliczone operacje w repozytorium. Spróbuj ponownie później.',
      ),
    ).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toBeEnabled();
    await expect(within(dialog).getByRole('button', { name: 'Usuń' })).toBeEnabled();
    await expect(onSessionDeleted).not.toHaveBeenCalled();
  },
};

/** Deleted in another view (or an unknown id): the not-found view with a way to a new Session. */
export const SessionDeletedElsewhere: Story = {
  tags: ['contract'],
  render: (args) => (
    <ManagedSession
      {...args}
      api={{
        ...fixtureApi(sessionFixture()),
        snapshot: () =>
          Promise.reject(
            new ApiError({
              kind: 'not-found',
              operation: 'sessions',
              outcome: 'not-applied',
              retryable: false,
              status: 404,
              code: 'SESSION_NOT_FOUND',
            }),
          ),
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    onNewSession.mockClear();
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'Ta sesja została usunięta lub nie istnieje',
      }),
    ).toBeVisible();
    await expect(canvas.getByText('Historia tej sesji nie jest już dostępna.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Nowa sesja' }));
    await expect(onNewSession).toHaveBeenCalledOnce();
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
    await expect(await menuLabels()).toEqual(['Zmień nazwę', 'Archiwizuj', 'Usuń']);
    await closeMenu();
  },
};
