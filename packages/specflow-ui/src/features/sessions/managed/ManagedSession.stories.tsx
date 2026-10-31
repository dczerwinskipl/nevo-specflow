import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, fn, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
  providerFixture,
  sessionFixture,
  staggeredContentApi,
} from './managedSession.stories-support';

const NARROW_VIEWPORT = { viewport: { value: 'mobile1', isRotated: false } };

/**
 * Item 1 regression: confirmed live (owner audit, DOM measurement at 390px) that "Cancel Turn"
 * and "Waiting For Question" specifically — both pairing the full interaction-response card with
 * the large, auto-stitching answer from `sessionFixture(true)` — render the pending-interaction
 * card/composer overlay directly on top of that answer's paragraph. Root cause: `MessageText.tsx`
 * stitches the answer's remaining pages into the paragraph via its own local state, after the
 * overlap-correction effect in `ManagedSession.tsx` has already run once, so the paragraph keeps
 * growing after the last scroll correction. No entry actually inside the scroller's own visible,
 * clipped viewport may render behind the floating overlay's screen-space rectangle (mirrors
 * `verifyComposerOverlayPadding` in `ManagedSession.fullSession.stories.tsx`).
 */
async function verifyNoEntryOverlapsComposer(canvasElement: HTMLElement) {
  await waitFor(() => {
    const scroller = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
    const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]');
    if (!scroller || !overlay) {
      throw new Error('Expected the message scroller and the floating composer overlay.');
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const overlayTop = overlay.getBoundingClientRect().top;
    for (const entry of canvasElement.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      if (insideVisibleWindow && rect.bottom > overlayTop) {
        throw new Error(
          `Entry "${entry.dataset.entryId}" renders behind the floating composer overlay.`,
        );
      }
    }
  });
}

/**
 * Item 1 follow-up regression: a single, non-retrying read of the same overlap condition
 * `verifyNoEntryOverlapsComposer` checks, for sampling the growth window itself. The original
 * `waitFor`-based check above only proves the overlap is gone by the time it finally stops
 * throwing — exactly the settled end-state that already passed once before this slipped through:
 * a transient overlap mid-growth, corrected again a frame later, would retry right past it.
 */
function entryOverlapsComposerNow(canvasElement: HTMLElement) {
  const scroller = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
  const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]');
  if (!scroller || !overlay) {
    return false;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const overlayTop = overlay.getBoundingClientRect().top;

  return Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-entry-id]')).some(
    (entry) => {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;

      return insideVisibleWindow && rect.bottom > overlayTop;
    },
  );
}

/**
 * Waits past one fully rendered frame, so a just-landed `ResizeObserver` correction has had the
 * chance it needs to actually apply before this samples the DOM. A single `requestAnimationFrame`
 * is not enough: per spec, a frame runs rAF callbacks *before* delivering `ResizeObserver`
 * notifications (then paints) — so sampling from inside a single rAF callback would inspect a
 * transient mid-frame state the browser itself corrects a moment later and never actually paints.
 * Waiting for a *second* rAF to start guarantees the first frame's resize-observer-and-paint steps
 * already ran, so this samples only states a viewer could actually see.
 */
function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Repeatedly samples the overlap condition, frame by frame, for `durationMs` — across the whole
 * mount-to-settle sequence, not only its final state — and fails on the first frame where an
 * entry overlaps the floating composer overlay. Exercises exactly the race this regression is
 * for: `MessageText.tsx`'s auto-stitch keeps growing an answer's box over several renders, and
 * `ManagedSession.tsx`'s overlap-correction must land before the *next* paint each time, not
 * merely by the time the fetch sequence as a whole finishes.
 */
async function sampleNoOverlapDuringGrowth(canvasElement: HTMLElement, durationMs: number) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    if (entryOverlapsComposerNow(canvasElement)) {
      throw new Error('An entry overlapped the floating composer overlay mid-growth.');
    }

    await nextFrame();
  }
}

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
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Którą część rozwiązania sprawdzić w następnej kolejności?'),
    ).toBeVisible();
    // One adaptive Send/Stop action (not two simultaneous buttons): while the Turn is active and
    // waiting on this interaction, the composer shows the single button as Stop, not a disabled
    // Send — the structured response above is how the user answers.
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
    await expect(canvas.queryByRole('button', { name: 'Wyślij' })).not.toBeInTheDocument();
    // Item 1 regression: at 390px, the large auto-stitching answer must never end up rendered
    // behind the pending-interaction card/composer overlay.
    await verifyNoEntryOverlapsComposer(canvasElement);
    // Item 6 regression: the structured interaction-response field is not free prose, so native
    // spellcheck stays off (no red squiggly underlines on a structured response field).
    await expect(canvas.getByLabelText('Twoja odpowiedź')).toHaveAttribute('spellcheck', 'false');
  },
};
/**
 * Item 1 follow-up regression (see `sampleNoOverlapDuringGrowth`): paces the large answer's
 * remaining pages behind a real delay (`staggeredContentApi`) instead of `fixtureApi`'s
 * same-microtask pages, so the mount-to-settle sequence actually spans multiple animation
 * frames — the window the owner observed the floating interaction card briefly overlap the
 * still-growing paragraph in, before `ManagedSession.tsx`'s overlap-correction caught up.
 */
export const GrowingAnswerNeverOverlapsComposer: Story = {
  args: { owner: 'growth-story', api: staggeredContentApi(sessionFixture(true)) },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Którą część rozwiązania sprawdzić w następnej kolejności?'),
    ).toBeVisible();
    // Samples the full sequence, not just the end: the three staggered fragments (360ms total at
    // 120ms each) keep the paragraph growing throughout, and every sampled frame must already be
    // clear of the overlay, not merely the frame after the fetch sequence completes.
    await sampleNoOverlapDuringGrowth(canvasElement, 600);
    await expect(
      await canvas.findByText(/jedna całość\.$/, undefined, { timeout: 5000 }),
    ).toBeVisible();
    await verifyNoEntryOverlapsComposer(canvasElement);
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
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    cancelApi.cancel.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Zatrzymaj' }));
    await waitFor(() => expect(cancelApi.cancel).toHaveBeenCalledOnce());
    // Item 1 regression: at 390px, the large auto-stitching answer must never end up rendered
    // behind the pending-interaction card/composer overlay.
    await verifyNoEntryOverlapsComposer(canvasElement);
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
// Fixture copy stays Polish throughout the story, matching every surrounding label (owner audit:
// this entry was the one English string left over in an otherwise-localized story).
const quotaFailureText = 'Limit zapytań Claude lub ograniczenie szybkości uniemożliwiło operację.';
quota.entries.push({
  ...quota.entries[0]!,
  id: 'quota',
  ordinal: 3,
  kind: 'commentary',
  text: {
    text: quotaFailureText,
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
    await expect(await canvas.findByText(quotaFailureText)).toBeVisible();
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
