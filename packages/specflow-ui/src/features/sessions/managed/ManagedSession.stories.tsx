import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, fn, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
  providerFixture,
  sessionFixture,
} from './managedSession.stories-support';

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
export const HistoryReturn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Wczytaj starsze wiadomości' }),
    );
    await expect(await canvas.findByText('Starsza wiadomość')).toBeVisible();
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Wróć do najnowszych wiadomości' }),
    );
    await waitFor(() => expect(canvas.queryByText('Starsza wiadomość')).not.toBeInTheDocument());
  },
};

const answerApi = { ...fixtureApi(sessionFixture(true)), respond: fn().mockResolvedValue({}) };
export const AnswerQuestion: Story = {
  args: { owner: 'answer-story', api: answerApi },
  play: async ({ canvasElement }) => {
    answerApi.respond.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Wczytywanie starszych wiadomości' }),
    );
    await waitFor(() => expect(answerApi.respond).toHaveBeenCalledOnce());
    await expect(answerApi.respond.mock.calls[0]?.[2]).toMatchObject({
      kind: 'question',
      answer: { optionIds: ['history'] },
    });
  },
};

const cancelApi = { ...fixtureApi(sessionFixture(true)), cancel: fn().mockResolvedValue({}) };
export const CancelTurn: Story = {
  args: { owner: 'cancel-story', api: cancelApi },
  play: async ({ canvasElement }) => {
    cancelApi.cancel.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Zatrzymaj' }));
    await waitFor(() => expect(cancelApi.cancel).toHaveBeenCalledOnce());
  },
};

const multiple = sessionFixture(true);
if (multiple.interaction?.kind === 'question') {
  multiple.interaction.maxSelections = 2;
}

export const UnsupportedMultipleChoice: Story = {
  args: { owner: 'multi-story', api: fixtureApi(multiple) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('To pytanie wymaga kontrolek, które nie są jeszcze dostępne.'),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Wczytywanie starszych wiadomości' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Odpowiedz' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
  },
};

const quota = sessionFixture();
quota.entries.push({
  ...quota.entries[0]!,
  id: 'quota',
  ordinal: 3,
  kind: 'commentary',
  text: {
    text: 'Claude quota or rate limit prevented the operation.',
    complete: true,
  },
});
quota.entries.push({
  ...quota.entries[0]!,
  id: 'failed',
  ordinal: 4,
  kind: 'outcome',
  text: { text: 'failed', complete: true },
});
export const QuotaFailure: Story = {
  args: { owner: 'quota-story', api: fixtureApi(quota) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Claude quota or rate limit prevented the operation.'),
    ).toBeVisible();
    await expect(canvas.getByLabelText('Wiadomość')).toBeEnabled();
  },
};

function optionByLabel(text: string) {
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (node) => node.textContent?.includes(text),
  );
  if (!option) {
    throw new Error(`Option "${text}" should exist.`);
  }

  return option;
}

const modelApi = {
  ...fixtureApi(sessionFixture()),
  start: fn().mockResolvedValue({ turnId: 'turn' }),
};
export const SelectModelEffort: Story = {
  args: { owner: 'model-story', api: modelApi },
  play: async ({ canvasElement }) => {
    modelApi.start.mockClear();
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('combobox', {
      name: 'Model i poziom wysiłku dla następnej wiadomości',
    });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
    await userEvent.click(optionByLabel('Standard · high'));
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull());
    await userEvent.type(canvas.getByLabelText('Wiadomość'), 'Testowa wiadomość');
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await waitFor(() => expect(modelApi.start).toHaveBeenCalledOnce());
    await expect(modelApi.start.mock.calls[0]?.[1]).toMatchObject({
      modelId: 'mock-standard',
      effort: 'high',
    });
  },
};

const noOverrideApi = {
  ...fixtureApi(sessionFixture()),
  providers: () =>
    Promise.resolve({
      items: [
        {
          ...providerFixture(),
          capabilities: { ...providerFixture().capabilities, modelOverride: false },
        },
      ],
    }),
};
export const NoModelOverrideCapability: Story = {
  args: { owner: 'no-override-story', api: noOverrideApi },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Wiadomość')).toBeEnabled();
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
  },
};
