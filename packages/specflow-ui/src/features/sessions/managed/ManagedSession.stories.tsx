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
    // The large answer's remaining pages are fetched and stitched in automatically: no
    // "read more"/"previous"/"next" controls are ever rendered, and the full text appears as
    // one continuous block once the fetch sequence completes.
    await expect(
      await canvas.findByText(/jedna całość\.$/, undefined, { timeout: 5000 }),
    ).toBeVisible();
    await expect(
      canvas.queryByText(/Czytaj dalej|Poprzedni fragment|Następny fragment/),
    ).toBeNull();
  },
};
/** Item 4: Copy acts on each authored message's own full resolved text — `MessageText.tsx`'s
 * auto-stitched content, not just the capped initial preview `ReadableText` starts with. */
export const CopyMessage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/jedna całość\.$/, undefined, { timeout: 5000 }),
    ).toBeVisible();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const [requestCopy, answerCopy] = canvas.getAllByRole('button', {
        name: 'Kopiuj wiadomość',
      });
      if (!requestCopy || !answerCopy) {
        throw new Error('Expected a Copy action on the request and the answer message.');
      }

      await userEvent.click(answerCopy);
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const copiedAnswer = writeText.mock.calls[0]?.[0] as string;
      await expect(copiedAnswer.startsWith('To jest krótki podgląd dużej odpowiedzi.')).toBe(true);
      await expect(copiedAnswer.endsWith('jedna całość.')).toBe(true);
      await canvas.findByText('Skopiowano');

      writeText.mockClear();
      await userEvent.click(requestCopy);
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(sessionFixture().entries[0]!.text.text),
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, 'clipboard', descriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  },
};
export const WaitingForQuestion: Story = {
  args: { api: fixtureApi(sessionFixture(true)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Którą część rozwiązania sprawdzić w następnej kolejności?'),
    ).toBeVisible();
    // One adaptive Send/Stop action (not two simultaneous buttons): while the Turn is active and
    // waiting on this interaction, the composer shows the single button as Stop, not a disabled
    // Send — the structured response above is how the user answers.
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
    await expect(canvas.queryByRole('button', { name: 'Wyślij' })).not.toBeInTheDocument();
  },
};
// Owner feedback #5: older history auto-loads (no manual button) once the scroller is at/near
// the top — these two short fixtures never overflow, so that is true as soon as they mount, the
// same condition a short conversation hits in the real app with more history above it.
export const HistoryFailure: Story = {
  args: { api: fixtureApi(sessionFixture(), true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Wczytaj starsze wiadomości' })).toBeNull();
    await expect(
      await canvas.findByText('Nie udało się wczytać starszych wiadomości.'),
    ).toBeVisible();
    // The manual-retry affordance survives the switch to auto-loading (still needed once it has
    // actually failed — auto-loading must not just silently retry forever).
    await userEvent.click(canvas.getByRole('button', { name: 'Spróbuj ponownie' }));
    await expect(canvas.getByLabelText('Wiadomość')).toBeEnabled();
  },
};
/**
 * `fixtureApi`'s `snapshot()` always reports the same static `history.hasOlder: true` — realistic
 * for the first load, but "Return to latest" (`feed.latest()`) re-fetches that same snapshot from
 * scratch, which would otherwise make auto-loading (item 5) legitimately start right over, racing
 * this story's own assertion that the older entry is gone. A real backend would not keep claiming
 * unlimited history forever, so this wrapper reflects that the older page was already exhausted
 * once fetched, same as it would be across a real reconnect.
 */
function historyReturnApi() {
  const base = fixtureApi(sessionFixture());
  let exhausted = false;

  return {
    ...base,
    snapshot: async (...args: Parameters<typeof base.snapshot>) => {
      const fresh = await base.snapshot(...args);

      return exhausted ? { ...fresh, history: { hasOlder: false } } : fresh;
    },
    history: async (...args: Parameters<typeof base.history>) => {
      const page = await base.history(...args);
      exhausted = true;

      return page;
    },
  };
}

export const HistoryReturn: Story = {
  args: { api: historyReturnApi() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Wczytaj starsze wiadomości' })).toBeNull();
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

/** Finds the specific "Standard · high" `menuitemradio` by its own label line, not the full
 * accessible name (which also includes that model's "available efforts" description — identical
 * on every one of its effort rows, so matching on it alone would not disambiguate low vs. high). */
function modelOptionByLabel(menu: HTMLElement, label: string) {
  const option = within(menu)
    .getAllByRole('menuitemradio')
    .find((item) => within(item).queryByText(label));
  if (!option) {
    throw new Error(`Option "${label}" should exist.`);
  }

  return option;
}

async function openModelMenu(canvasElement: HTMLElement, triggerName: string) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: triggerName }));

  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) {
      throw new Error('The model/effort menu should open.');
    }

    return menu;
  });
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
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    await userEvent.click(modelOptionByLabel(menu, 'Standard · high'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
    await expect(await canvas.findByRole('button', { name: 'Standard · high' })).toBeVisible();
    await userEvent.type(canvas.getByLabelText('Wiadomość'), 'Testowa wiadomość');
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await waitFor(() => expect(modelApi.start).toHaveBeenCalledOnce());
    await expect(modelApi.start.mock.calls[0]?.[1]).toMatchObject({
      modelId: 'mock-standard',
      effort: 'high',
    });
  },
};

/** The Menu's richer per-item presentation (item 3): each effort row of a multi-effort model also
 * shows a description line listing every effort that model supports. */
export const ModelMenuShowsAvailableEfforts: Story = {
  args: { owner: 'model-description-story', api: fixtureApi(sessionFixture()) },
  play: async ({ canvasElement }) => {
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    // `waitFor` (not a bare assertion) absorbs the Menu's own open fade-in transition — right
    // after it appears in the DOM its content is still mid-animation (`opacity: 0` on
    // `MenuContent` itself), so an immediate `toBeVisible()` would be a false negative, not a
    // real regression.
    await waitFor(async () => {
      const high = modelOptionByLabel(menu, 'Standard · high');
      await expect(within(high).getByText('Dostępne poziomy wysiłku: low, high')).toBeVisible();
    });
    const fast = modelOptionByLabel(menu, 'Fast');
    await expect(within(fast).queryByText(/Dostępne poziomy wysiłku/)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
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
    await expect(canvasElement.querySelector('#managed-model')).toBeNull();
  },
};
