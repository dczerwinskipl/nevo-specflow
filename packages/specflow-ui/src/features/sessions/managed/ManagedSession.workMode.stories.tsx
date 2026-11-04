import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { ManagedSession } from './ManagedSession';
import type { ManagedSessionsApi } from './api';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import { Environment } from './managedSession.storyHelpers.stories-support';

/**
 * `SpecFlow/Screens/Managed Session` — the Composer's work-mode picker over the Session provider's
 * own Runtime catalogue (`providerModes`; the `mock` fixture provider offers Agent and Plan), and
 * the `StartTurn` fields a pick produces. Same title as the other Managed Session groups, tagged
 * `contract` so it stays out of the default sidebar.
 */
const start = fn<ManagedSessionsApi['start']>().mockResolvedValue({
  turnId: '00000000-0000-4000-8000-0000000000aa',
});
const api = (snapshot: SessionSnapshot): ManagedSessionsApi => ({ ...fixtureApi(snapshot), start });

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
    owner: 'story-work-mode',
    api: fixtureApi(sessionFixture()),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

async function send(canvasElement: HTMLElement, message: string) {
  const canvas = within(canvasElement);
  start.mockClear();
  await userEvent.type(canvas.getByLabelText('Wiadomość'), message);
  await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
  await waitFor(() => expect(start).toHaveBeenCalled());

  return start.mock.calls.at(-1)![1];
}

/** A pick sends its engine mode plus the provider mode id; the trigger shows the provider's title. */
export const WorkModeFromRuntimeCatalogue: Story = {
  tags: ['contract'],
  args: { api: api(sessionFixture()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // No mode of its own on the Session: the catalogue default (`defaultModeId`) is shown.
    await userEvent.click(await canvas.findByRole('button', { name: 'Tryb pracy: Agent' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Agent', 'Plan']);
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Plan' }));
    await expect(await canvas.findByRole('button', { name: 'Tryb pracy: Plan' })).toBeVisible();
    await expect(await send(canvasElement, 'Najpierw plan')).toMatchObject({
      message: 'Najpierw plan',
      mode: 'read-only',
      providerModeId: 'plan',
    });
  },
};

/** A Session already in a provider mode shows it and, untouched, lets the next Turn inherit it. */
export const WorkModeInheritedFromSession: Story = {
  tags: ['contract'],
  args: {
    owner: 'story-work-mode-inherited',
    api: (() => {
      const snapshot = sessionFixture();
      snapshot.session.providerModeId = 'plan';

      return api(snapshot);
    })(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Tryb pracy: Plan' })).toBeVisible();
    const request = await send(canvasElement, 'Dalej w tym samym trybie');
    await expect(request).not.toHaveProperty('providerModeId');
    await expect(request).not.toHaveProperty('mode');
  },
};
