import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import { Environment, NARROW_VIEWPORT } from './managedSession.storyHelpers.stories-support';
import { unknownTurnSnapshot } from './sessionActions/sessionActions.stories-support';
import { scriptedFixture, scriptedRender } from './sessionActions/scriptedSession.stories-support';

/**
 * A Turn whose outcome is unknown (full-session-screen-structure §17.1): one attention notice above the
 * Composer owns the fact; with Manage it checks the outcome through the Runtime's evidence path.
 */
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
    owner: 'reconcile-story',
    api: fixtureApi(sessionFixture()),
  },
  render: scriptedRender(() => unknownTurnSnapshot()),
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

const title = 'Nie wiadomo, jak zakończyła się ostatnia tura';

export const UnknownTurn: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(title)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sprawdź wynik' })).toBeVisible();
    // The single owner: the header says it once, no live line or spinner, no Stop.
    await expect(canvas.getByText(/^Wynik tury nieznany( ·|$)/)).toBeVisible();
    await expect(canvas.queryByText('Turn outcome is unknown')).toBeNull();
    await expect(canvas.queryByText('Dostawca sesji jest niedostępny.')).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Zatrzymaj' })).toBeNull();
  },
};

export const UnknownTurnWithoutManage: Story = {
  tags: ['contract'],
  render: scriptedRender(() => unknownTurnSnapshot(false)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(title)).toBeVisible();
    await expect(
      canvas.getByText('Wynik może sprawdzić osoba zarządzająca tą sesją.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Sprawdź wynik' })).toBeNull();
  },
};

export const UnknownTurnChecking: Story = {
  tags: ['contract'],
  render: scriptedRender(() => unknownTurnSnapshot(), { reconcile: ['hold'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Sprawdź wynik' }));
    const pending = await canvas.findByRole('button', { name: 'Sprawdzanie…' });
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    await expect(pending).toHaveFocus();
    await userEvent.click(pending);
    await expect(scriptedFixture().calls.reconcile).toHaveLength(1);
  },
};

/** 409: no evidence yet. The Turn stays unresolved and the check can be asked again. */
export const UnknownTurnNoEvidence: Story = {
  tags: ['contract'],
  render: scriptedRender(() => unknownTurnSnapshot(), {
    reconcile: [{ status: 409, code: 'SESSION_RECOVERY_REQUIRED' }],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Sprawdź wynik' }));
    await expect(
      await canvas.findByText(
        'Dostawca nie ma jeszcze dowodu wyniku. Tura pozostaje nierozstrzygnięta — spróbuj ponownie później.',
      ),
    ).toBeVisible();
    await expect(canvas.getByText(title)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    const [first, second] = scriptedFixture().calls.reconcile;
    await expect(second).not.toBe(first);
  },
};

export const UnknownTurnUnconfirmed: Story = {
  tags: ['contract'],
  render: scriptedRender(() => unknownTurnSnapshot(), { reconcile: ['lost', 'hold'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Sprawdź wynik' }));
    await expect(
      await canvas.findByText('Nie potwierdzono sprawdzenia. Spróbuj ponownie.'),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    const [first, retry] = scriptedFixture().calls.reconcile;
    await expect(retry).toBe(first);
  },
};

/** Settled to `failed`: the notice leaves with the unknown state and a toast confirms it. */
export const UnknownTurnResolved: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(canvas.queryByText(title)).toBeNull());
    await expect(await within(document.body).findByText('Ustalono wynik tury.')).toBeVisible();
    await expect(canvas.queryByText(/^Wynik tury nieznany( ·|$)/)).toBeNull();
  },
};

/** Narrow: the notice sits above the Composer without opening Context. */
export const UnknownTurnNarrow: Story = {
  tags: ['contract'],
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    const notice = await canvas.findByText(title);
    await expect(notice).toBeVisible();
    const editor = canvas.getByRole('textbox', { name: 'Wiadomość' });
    await expect(notice.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      editor.getBoundingClientRect().top,
    );
  },
};
