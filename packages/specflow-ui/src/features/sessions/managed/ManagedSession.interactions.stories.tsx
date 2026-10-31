import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, fn, waitFor } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
  providerFixture,
  sessionFixture,
  staggeredContentApi,
} from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  longConversationLastMessage,
  longConversationSnapshot,
} from './managedSession.fullSession.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import {
  Environment,
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  verifyComposerOverlayPadding,
  verifyNoEntryOverlapsComposer,
} from './managedSession.storyHelpers.stories-support';

/**
 * `SpecFlow/Contracts/Managed Session interactions`: regression/behavior checks that drive a
 * specific user action, flow, or race on top of the `States` the screen can be in
 * (`SpecFlow/Screens/Managed Session/States`, `ManagedSession.states.stories.tsx`) — a click, a
 * keyboard action, a scroll, or a timed sequence — rather than a state a user simply lands on.
 * Filed under `Contracts` (matching this repo's existing convention for behavior-verification
 * stories, e.g. `SpecFlow/Contracts/Cache observer`) so these don't compete with `States` for
 * attention when browsing what the screen actually looks like. `WorkInspector.stories.tsx` is its
 * own, separately organized group and is untouched.
 */

const meta = {
  title: 'SpecFlow/Contracts/Managed Session interactions',
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

/**
 * Item 1 follow-up regression: a single, non-retrying read of the same overlap condition
 * `verifyNoEntryOverlapsComposer` checks, for sampling the growth window itself. The original
 * `waitFor`-based check only proves the overlap is gone by the time it finally stops throwing —
 * exactly the settled end-state that already passed once before this slipped through: a
 * transient overlap mid-growth, corrected again a frame later, would retry right past it.
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

/**
 * Item 7 (test coverage gap): no other story has enough messages to force real scrolling, so the
 * floating composer's scroll-padding/overlap-correction fix was "inconclusive, not confirmed" for
 * a genuinely long conversation (owner audit). This exercises the real condition: confirms the
 * fixture actually overflows by a meaningful margin (not a vacuous pass), scrolls to the true
 * bottom the way a user would, then asserts via `verifyComposerOverlayPadding` that no entry
 * — specifically the very last message — renders behind the floating overlay.
 */
export const LongConversationScroll: Story = {
  args: {
    owner: 'full-session-story',
    api: fixtureApi(longConversationSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const scroller = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
      if (!node) {
        throw new Error('Expected the message scroller.');
      }

      return node;
    });

    // Confirms this fixture genuinely stresses the mechanism: a short conversation could "pass"
    // the overlap check vacuously, simply because nothing ever needed to scroll.
    await waitFor(() => {
      const overflow = scroller.scrollHeight - scroller.clientHeight;
      if (!(overflow > 400)) {
        throw new Error(
          `Expected the long conversation to overflow by a meaningful margin, got ${overflow}px ` +
            `(scrollHeight ${scroller.scrollHeight}, clientHeight ${scroller.clientHeight}).`,
        );
      }
    });

    // Scrolls to the true bottom, the same action a user takes — not just whatever position the
    // mount-time auto-scroll/auto-load-older bookkeeping happened to settle on.
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

    await verifyComposerOverlayPadding(canvasElement);

    const canvas = within(canvasElement);
    await expect(await canvas.findByText(longConversationLastMessage)).toBeVisible();
  },
};

function queryDirectTab(canvasElement: HTMLElement, label: string) {
  return [...canvasElement.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
    tab.textContent?.includes(label),
  );
}

async function openSwitcherMenu(canvasElement: HTMLElement) {
  const switcherButton = canvasElement.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  if (!switcherButton) {
    throw new Error('Expected the Secondary root-tab strip or its switcher button.');
  }

  await userEvent.click(switcherButton);

  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) {
      throw new Error('The switcher should open the Opened items menu.');
    }

    return menu;
  });
}

/**
 * Activates a root tab by label, working whether `ItemTabs` shows the full strip (`[role="tab"]`)
 * or — item-tabs.md's narrow-width switcher collapse, which the Secondary pane's own width can
 * trigger well before the overall viewport counts as narrow (the same behavior
 * `AppWorkspaceDynamicSplit.contract.stories.tsx` exercises in nevo-ui) — the single switcher
 * button and its Opened items menu. With `assertNotClosable`, also asserts this tab offers no
 * close control in whichever presentation is showing (the pinned Context tab, contract §3).
 */
async function activateRootTab(
  canvasElement: HTMLElement,
  label: string,
  assertNotClosable = false,
) {
  const directTab = queryDirectTab(canvasElement, label);
  if (directTab) {
    if (assertNotClosable) {
      await expect(canvasElement.querySelector(`button[aria-label="Close ${label}"]`)).toBeNull();
    }

    await userEvent.click(directTab);

    return;
  }

  const menu = await openSwitcherMenu(canvasElement);
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  if (assertNotClosable) {
    await expect(items.some((item) => item.textContent?.startsWith(`Close ${label}`))).toBe(false);
  }

  const row = items.find(
    (item) => !item.textContent?.startsWith('Close ') && item.textContent?.includes(label),
  );
  if (!row) {
    throw new Error(`The Opened items menu should list "${label}".`);
  }

  await userEvent.click(row);
}

/** Closes a root tab by label, robust to the same strip/switcher presentations as {@link activateRootTab}. */
async function closeRootTab(canvasElement: HTMLElement, label: string) {
  const directClose = canvasElement.querySelector<HTMLElement>(
    `button[aria-label="Close ${label}"]`,
  );
  if (directClose) {
    await userEvent.click(directClose);

    return;
  }

  const menu = await openSwitcherMenu(canvasElement);
  const row = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.startsWith(`Close ${label}`),
  );
  if (!row) {
    throw new Error(`The Opened items menu should offer "Close ${label}".`);
  }

  await userEvent.click(row);
}

function hasRootTabStrip(canvasElement: HTMLElement) {
  return (
    canvasElement.querySelector('[role="tab"]') !== null ||
    canvasElement.querySelector('[aria-haspopup="menu"]') !== null
  );
}

/**
 * Scoped W01-W04 adoption (coordinator demo ahead of W05/W06/W07): clicking a Related Task opens
 * it as its own independent root tab, coexisting with the pinned Context tab, instead of today's
 * "replaces Context entirely" behavior — `SessionContext`'s `openRelatedTask` on the wide/
 * pinned-tab desktop path. Exercises the full sequence end-to-end: Context open (pinned tab, no
 * strip visible) -> click a Related Task -> strip appears with 2 tabs (Context pinned/
 * non-closable, Task closable) -> Task detail content visible -> click back to the Context tab
 * via the strip -> Context still shown with its state intact -> close the Task tab -> strip
 * disappears, back to a single-pinned-tab baseline that is DOM-identical to before (W03's own
 * regression-check standard, `verifyContextReopens`'s sibling check in the `States` group).
 */
export const RelatedTaskOpensAsIndependentTab: Story = {
  args: {
    owner: 'full-session-story',
    api: fixtureApi(genericSpecLevelSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Baseline: Context is the single pinned tab — no root-tab strip yet (W03 §4.1: the strip
    // only appears once 2+ tabs are open).
    await expect(await canvas.findByText('Powiązane zadania')).toBeVisible();
    await expect(hasRootTabStrip(canvasElement)).toBe(false);
    const secondaryRegion = () =>
      canvasElement.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
    const baselineSecondaryHTML = secondaryRegion()?.outerHTML;
    await expect(baselineSecondaryHTML).toBeTruthy();

    // Click a Related Task: it opens as its own tab, coexisting with the pinned Context tab.
    const relatedTaskLink = canvas.getByText('Document the admission guard').closest('button');
    if (!relatedTaskLink) {
      throw new Error('The Related Tasks link should render as a button.');
    }

    await userEvent.click(relatedTaskLink);

    // Task detail content is visible, and Context's own content is backgrounded (only one tab's
    // content is ever mounted at a time) — proof the Task opened and became the active tab.
    await expect(
      await canvas.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeVisible();
    await expect(canvas.getByText('TASK-02')).toBeVisible();
    await expect(canvas.queryByText('Powiązane zadania')).not.toBeInTheDocument();
    await waitFor(() => expect(hasRootTabStrip(canvasElement)).toBe(true));

    // Click back to the Context tab via the strip (asserting it has no close control along the
    // way — the pinned tab, contract §3): Context is shown again with its state intact.
    await activateRootTab(canvasElement, 'Kontekst', true);
    await waitFor(() => expect(canvas.getByText('Powiązane zadania')).toBeVisible());
    await expect(canvas.getByText('Document the admission guard')).toBeVisible();

    // Close the Task tab — named after the real Task (`tabLabel`), never the generic "Zadanie"
    // screen title (live-review finding: a Task tab must be told apart from another Task's tab by
    // name, not just by which one is active) — and the strip disappears, back to the
    // single-pinned-tab baseline.
    await closeRootTab(canvasElement, 'TASK-02 Document the admission guard');
    await waitFor(() => expect(hasRootTabStrip(canvasElement)).toBe(false));
    await waitFor(() => expect(secondaryRegion()?.outerHTML).toBe(baselineSecondaryHTML));
  },
};
