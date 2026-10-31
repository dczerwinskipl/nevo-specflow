import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, fn, waitFor } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
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
  verifyNoHeaderOverlapsInteractionPrompt,
} from './managedSession.storyHelpers.stories-support';

/**
 * `SpecFlow/Screens/Managed Session`: regression/behavior checks that drive a specific user
 * action, flow, or race on top of the states the screen can be in
 * (`ManagedSession.states.stories.tsx`, same title) — a click, a keyboard action, a scroll, or a
 * timed sequence — rather than a state a user simply lands on. Filed under the same canonical
 * `SpecFlow/Screens/Managed Session` title as the states group (Storybook catalog rework, §3.1
 * rule 1: no ad hoc top-level `Contracts`/`Sessions` categories) and tagged `contract`/
 * `integration` per story so they stay out of the default sidebar instead of competing with the
 * screen's single visible `Default` for attention — hidden, not deleted: tags only affect
 * visibility, every `play` function here is already part of the Chromium suite via Storybook's
 * own `play-fn` tag regardless of this tag. `WorkInspector.stories.tsx` is its own, separately
 * organized group and is untouched.
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
  args: { sessionId: fixtureSessionId, owner: 'story', api: fixtureApi(sessionFixture()) },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tail: Story = {
  tags: ['contract'],
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
  tags: ['contract'],
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
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): checked at both
    // widths the audit specifically measured.
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
  },
};

// Owner feedback #5: older history auto-loads (no manual button) once the scroller is at/near
// the top — these two short fixtures never overflow, so that is true as soon as they mount, the
// same condition a short conversation hits in the real app with more history above it.
export const HistoryFailure: Story = {
  tags: ['contract'],
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
  tags: ['contract'],
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
  tags: ['contract'],
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
  tags: ['contract'],
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
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): checked at both
    // widths the audit specifically measured.
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
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
  tags: ['contract'],
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
 * Corrected per full-session-screen-structure.md §7.4/§10.1 — read in full before touching this
 * story again: "Its concise, clickable content summaries open/reselect root tabs such as
 * Tasks... A Task selection from a Tasks tab pushes Task detail onto that tab's local stack... Do
 * not spawn an independent tab for a task-bound event and lose provenance", and §10.1's own
 * "Work -> ToolAction stays inside the Work tab" example (the tab's identity never renames itself
 * to whichever detail is open inside it).
 *
 * Previously named `RelatedTaskOpensAsIndependentTab` and asserted the OPPOSITE of the above — a
 * confirmed bug (`SessionContext`'s `openRelatedTask` used to call `navigation.openTab` with a
 * per-Task `instanceId`, giving each related Task its own independent tab and losing its
 * Tasks-tab provenance). Renamed to match the corrected behavior:
 * Context open (pinned tab, no strip visible) -> click the Related Tasks summary row (this
 * fixture has 2 related Tasks, so it opens the ONE Tasks tab on its list, not a direct Task) ->
 * strip appears with 2 tabs (Context pinned/non-closable, Tasks closable) -> select a Task from
 * the list -> Task detail is now the Tasks tab's own content (pushed onto its local stack,
 * `stack.navTo('task', ...)` in `SessionTasksInspector.tsx`'s `TaskList`) — still exactly 2 tabs,
 * no third one appears for the Task -> click back to the Context tab via the strip -> Context
 * still shown with its state intact -> close the Tasks tab -> strip disappears, back to a
 * single-pinned-tab baseline that is DOM-identical to before (W03's own regression-check
 * standard, `verifyContextReopens`'s sibling check in the `States` group).
 */
export const RelatedTaskPushesOntoSharedTasksTab: Story = {
  tags: ['integration'],
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

    // Click the Related Tasks summary row — this fixture has 2 related Tasks (TASK-02, TASK-03),
    // so it opens the shared Tasks tab on its list (`openRelatedTasksEntry`'s >1 branch), not a
    // direct per-Task tab.
    const relatedTasksRow = canvas.getByText('2 zadań').closest('button');
    if (!relatedTasksRow) {
      throw new Error('The Related Tasks summary row should render as a button.');
    }

    await userEvent.click(relatedTasksRow);

    await waitFor(() => expect(hasRootTabStrip(canvasElement)).toBe(true));
    await expect(canvas.queryByText('Powiązane zadania')).not.toBeInTheDocument();
    await expect(await canvas.findByText('Document the admission guard')).toBeVisible();
    await expect(canvas.getByText('Deterministic admission')).toBeVisible();

    // Select TASK-02 from the list: Task detail becomes this SAME tab's content — the core
    // correction. No independent "TASK-02 ..." tab appears alongside it.
    const taskRow = canvas.getByText('Document the admission guard').closest('button');
    if (!taskRow) {
      throw new Error('The Task row inside the Tasks tab should render as a button.');
    }

    await userEvent.click(taskRow);

    await expect(
      await canvas.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeVisible();
    await expect(canvas.getByText('TASK-02')).toBeVisible();
    await expect(queryDirectTab(canvasElement, 'Document the admission guard')).toBeUndefined();

    // Click back to the Context tab via the strip (asserting it has no close control along the
    // way — the pinned tab, contract §3): Context is shown again with its state intact.
    await activateRootTab(canvasElement, 'Kontekst', true);
    await waitFor(() => expect(canvas.getByText('Powiązane zadania')).toBeVisible());

    // Close the Tasks tab — labelled "Zadania" throughout (never renamed to the Task that was open
    // inside it, per §10.1's "Work -> ToolAction stays inside the Work tab" rule) — and the strip
    // disappears, back to the single-pinned-tab baseline.
    await closeRootTab(canvasElement, 'Zadania');
    await waitFor(() => expect(hasRootTabStrip(canvasElement)).toBe(false));
    await waitFor(() => expect(secondaryRegion()?.outerHTML).toBe(baselineSecondaryHTML));
  },
};
