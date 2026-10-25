import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';

function Environment({ children }: { children: React.ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <StoryLocalization locale="pl">
      <QueryClientProvider client={query}>
        <div className="h-dvh">
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspaceProvider>{children}</AppWorkspaceProvider>
          </AppShell>
        </div>
      </QueryClientProvider>
    </StoryLocalization>
  );
}
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
  args: { sessionId: fixtureSessionId, owner: 'story', api: fixtureApi(sessionFixture()) },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Tail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Wiadomość')).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Czytaj dalej' }));
    await expect(await canvas.findByText(/Dalszy fragment dużej wiadomości/)).toBeVisible();
  },
};
export const WaitingForQuestion: Story = {
  args: { api: fixtureApi(sessionFixture(true)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Którą część rozwiązania sprawdzić w następnej kolejności?'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Wyślij' })).toBeDisabled();
  },
};
export const HistoryFailure: Story = {
  args: { api: fixtureApi(sessionFixture(), true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Wczytaj starsze wiadomości' }),
    );
    await expect(
      await canvas.findByText('Nie udało się wczytać starszych wiadomości.'),
    ).toBeVisible();
    await expect(canvas.getByLabelText('Wiadomość')).toBeEnabled();
  },
};
