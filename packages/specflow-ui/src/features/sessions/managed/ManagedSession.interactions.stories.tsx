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
  // A conversation long enough to scroll, with one older page above it: the reader can only be
  // "away" from the latest messages by actually scrolling into history (loading older entries
  // alone never counts as away — feed.ts, `older()`).
  const snapshot = longConversationSnapshot();
  snapshot.history = { hasOlder: true, before: 'older' };
  const base = fixtureApi(snapshot);
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

/**
 * The reader scrolls up into history: older messages auto-load at the top, the "Return to latest"
 * pill appears because the reader is away from the latest messages, and using it replaces the
 * window with the live end again (the older page is gone, so is the pill).
 */
export const HistoryReturn: Story = {
  tags: ['contract'],
  args: { owner: 'history-return-story', api: historyReturnApi() },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    const latestPill = () =>
      canvas.queryByRole('button', { name: 'Wróć do najnowszych wiadomości' });
    await expect(await canvas.findByText(longConversationLastMessage)).toBeInTheDocument();
    const scroller = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
      if (!node || !(node.scrollHeight - node.clientHeight > 400)) {
        throw new Error('Expected the conversation to overflow its scroller.');
      }

      return node;
    });
    // At the latest messages there is nothing to return to.
    await expect(latestPill()).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Wczytaj starsze wiadomości' })).toBeNull();

    // A scroll within 200ms of a resize is the browser re-laying out, never the reader scrolling
    // away (`useLayoutInducedScroll`, `LAYOUT_SETTLE_MS`): the reader's scroll comes after the
    // viewport `settleViewport` just set has settled.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The reader scrolls to the top: older history loads by itself, the reader stays where they
    // were reading (not pulled back to the bottom), and is away from the latest messages.
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await expect(await canvas.findByText('Starsza wiadomość')).toBeInTheDocument();
    await waitFor(() =>
      expect(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight).toBeGreaterThan(
        400,
      ),
    );
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Wróć do najnowszych wiadomości' }),
    );
    await waitFor(() => expect(canvas.queryByText('Starsza wiadomość')).not.toBeInTheDocument());
    await expect(await canvas.findByText(longConversationLastMessage)).toBeInTheDocument();
    await waitFor(() => expect(latestPill()).toBeNull());
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

/**
 * The Secondary workspace region, scoped away from Primary (the composer's own "Attach"/"Choose
 * work mode"/"Choose model" buttons are ALSO `[aria-haspopup="menu"]` triggers — an unscoped
 * `canvasElement.querySelector('[aria-haspopup="menu"]')` matches the first of those instead of
 * the root-tab switcher, since Primary renders before Secondary in DOM order). Falls back to
 * `canvasElement` itself if the Secondary region isn't mounted (the narrow runtime Context flow
 * has no declarative Secondary at all).
 */
function secondaryRegionOf(canvasElement: HTMLElement) {
  return (
    canvasElement.querySelector<HTMLElement>('[data-workspace-surface="secondary"]') ??
    canvasElement
  );
}

/**
 * Strips React's own per-mount `useId()` ids (and the `aria-*` attributes that reference them —
 * `Progress`'s `aria-labelledby`, `Collapsible`'s `aria-controls`/`aria-labelledby`) before an
 * `outerHTML` snapshot comparison. These ids (`_r_7_`, `react-aria-_r_9_`, …) are real React
 * internals, not a stable part of the rendered contract: closing the Tasks tab and returning to
 * Context remounts `SessionTelemetrySection`'s `Progress`/`Collapsible` instances, so React hands
 * out fresh ids the second time even though the DOM is otherwise byte-for-byte the same. Comparing
 * raw `outerHTML` without normalizing them made this "back to baseline" check fail on every run,
 * regardless of any actual regression. The scroll area's `data-edge-*` flags are likewise
 * measurements (whether content overflows each edge when last observed), not structure: they
 * follow layout timing and flipped this comparison on a loaded machine.
 */
function normalizeAutoIds(html: string) {
  return html
    .replace(/\b(id|aria-labelledby|aria-controls|aria-describedby)="[^"]*"/g, '$1="_"')
    .replace(/\bdata-edge-(top|bottom|left|right)="[^"]*"/g, 'data-edge-$1="_"');
}

/** The markup with attributes in a fixed order, so two equal trees read as equal strings. */
function canonicalMarkup(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const write = (node: Node): string => {
    if (node instanceof Element) {
      const attributes = [...node.attributes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
        .join('');

      return `<${node.localName}${attributes}>${[...node.childNodes].map(write).join('')}</${node.localName}>`;
    }

    return node.textContent ?? '';
  };

  return [...template.content.childNodes].map(write).join('');
}

/** Where two markup strings first differ, for a failure message that names the difference. */
function firstMarkupDifference(a: string, b: string) {
  const left = canonicalMarkup(a);
  const right = canonicalMarkup(b);
  let index = 0;
  while (index < left.length && left[index] === right[index]) {
    index += 1;
  }

  return `at ${index}: "${left.slice(Math.max(0, index - 120), index + 160)}" vs "${right.slice(Math.max(0, index - 120), index + 160)}"`;
}

/** The same elements, attributes, values and text, in any attribute order (`isEqualNode`). */
function sameMarkup(a: string, b: string) {
  const parse = (html: string) => {
    const template = document.createElement('template');
    template.innerHTML = html;

    return template.content;
  };

  return parse(a).isEqualNode(parse(b));
}

function queryDirectTab(canvasElement: HTMLElement, label: string) {
  return [...secondaryRegionOf(canvasElement).querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent?.includes(label),
  );
}

async function openSwitcherMenu(canvasElement: HTMLElement) {
  const switcherButton =
    secondaryRegionOf(canvasElement).querySelector<HTMLElement>('[aria-haspopup="menu"]');
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
      await expect(canvasElement.querySelector(`button[aria-label="Zamknij ${label}"]`)).toBeNull();
    }

    await userEvent.click(directTab);

    return;
  }

  const menu = await openSwitcherMenu(canvasElement);
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  if (assertNotClosable) {
    await expect(items.some((item) => item.textContent?.startsWith(`Zamknij ${label}`))).toBe(
      false,
    );
  }

  const row = items.find(
    (item) => !item.textContent?.startsWith('Zamknij ') && item.textContent?.includes(label),
  );
  if (!row) {
    throw new Error(`The Opened items menu should list "${label}".`);
  }

  await userEvent.click(row);
}

/** Closes a root tab by label, robust to the same strip/switcher presentations as {@link activateRootTab}. */
async function closeRootTab(canvasElement: HTMLElement, label: string) {
  const directClose = canvasElement.querySelector<HTMLElement>(
    `button[aria-label="Zamknij ${label}"]`,
  );
  if (directClose) {
    await userEvent.click(directClose);

    return;
  }

  const menu = await openSwitcherMenu(canvasElement);
  const row = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.startsWith(`Zamknij ${label}`),
  );
  if (!row) {
    throw new Error(`The Opened items menu should offer "Zamknij ${label}".`);
  }

  await userEvent.click(row);
}

/** The labels of the Secondary's root tabs (the strip is wide enough for all of them at 1440). */
function rootTabLabels(canvasElement: HTMLElement) {
  return [...secondaryRegionOf(canvasElement).querySelectorAll('[role="tab"]')].map(
    (tab) => tab.querySelector('.sr-only')?.textContent,
  );
}

function selectedRootTabLabel(canvasElement: HTMLElement) {
  return secondaryRegionOf(canvasElement).querySelector(
    '[role="tab"][aria-selected="true"] .sr-only',
  )?.textContent;
}

/**
 * Root tab identity is the object (full-session.md "Secondary tabs"): each Related Tasks
 * row (full-session.md "Context", one row per associated Task) opens that Task as its own tab named
 * by its key; a Task already open is activated, never duplicated. Context stays the pinned,
 * non-closable first tab throughout, and closing the opened tabs returns the Secondary to the
 * DOM-identical single-pinned-tab baseline.
 */
export const RelatedTasksOpenTaskTabs: Story = {
  tags: ['integration'],
  args: {
    owner: 'full-session-story',
    api: fixtureApi(genericSpecLevelSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Baseline: Context is the single pinned tab — on a split layout already the one tab of the
    // rail, so opening another tab never changes the header height under the content.
    await expect(await canvas.findByText('Powiązane zadania')).toBeVisible();
    await waitFor(() => expect(rootTabLabels(canvasElement)).toEqual(['Kontekst']));
    const secondaryRegion = () =>
      canvasElement.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
    const baselineSecondaryHTML = normalizeAutoIds(secondaryRegion()?.outerHTML ?? '');
    await expect(baselineSecondaryHTML).toBeTruthy();

    // `findByText` only guarantees the text node exists, not that the row's interactive `<button>`
    // wrapper finished its render pass — wait for the button itself.
    const taskRow = (title: string) =>
      waitFor(() => {
        const row = canvas.getByText(title).closest('button');
        if (!row) {
          throw new Error(`The "${title}" row should render as a button.`);
        }

        return row;
      });

    // A Related Tasks row opens that Task's own tab.
    await userEvent.click(await taskRow('Document the admission guard'));
    await waitFor(() => expect(rootTabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02']));
    await expect(selectedRootTabLabel(canvasElement)).toBe('TASK-02');
    await expect(
      await canvas.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeVisible();
    // A root tab is its own surface: nothing to go back to, so no detail header row either.
    await expect(canvasElement.querySelector('[data-workspace-detail-header]')).toBeNull();

    // Back in Context, another Task gets its own, distinctly labelled tab.
    await activateRootTab(canvasElement, 'Kontekst', true);
    await userEvent.click(await taskRow('Deterministic admission'));
    await waitFor(() =>
      expect(rootTabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02', 'TASK-03']),
    );
    await expect(selectedRootTabLabel(canvasElement)).toBe('TASK-03');
    await expect(
      await canvas.findByRole('heading', { name: 'Deterministic admission' }),
    ).toBeVisible();

    // The first Task again: its tab is activated and still shows that Task, not the last one.
    await activateRootTab(canvasElement, 'Kontekst', true);
    await userEvent.click(await taskRow('Document the admission guard'));
    await waitFor(() => expect(selectedRootTabLabel(canvasElement)).toBe('TASK-02'));
    await expect(rootTabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02', 'TASK-03']);
    await expect(
      await canvas.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeVisible();

    // Context is pinned (no close control) and shows again with its state intact.
    await activateRootTab(canvasElement, 'Kontekst', true);
    await waitFor(() => expect(canvas.getByText('Powiązane zadania')).toBeVisible());

    // Closing every opened tab returns to the single-pinned-tab baseline, DOM-identical.
    await closeRootTab(canvasElement, 'TASK-03');
    await closeRootTab(canvasElement, 'TASK-02');
    await waitFor(() => expect(rootTabLabels(canvasElement)).toEqual(['Kontekst']));
    // Closing a tab moves focus to its neighbour (item-tabs.md, "Focus after close"): the last
    // close lands on the pinned Context tab, whose focus tooltip then describes it
    // (`aria-describedby`). That is focus state, not structure: assert it, then move focus off the
    // strip so the comparison below sees the tab at rest, the way the baseline was taken.
    const contextTab = queryDirectTab(canvasElement, 'Kontekst');
    await waitFor(() => expect(document.activeElement).toBe(contextTab));
    contextTab?.blur();
    await waitFor(() => expect(contextTab).not.toHaveAttribute('aria-describedby'));
    // Attribute ORDER is not part of the contract: the first render adds the tab panel's
    // `aria-labelledby` after its other attributes, a remount writes them in source order.
    await waitFor(() => {
      const current = normalizeAutoIds(secondaryRegion()?.outerHTML ?? '');
      if (!sameMarkup(current, baselineSecondaryHTML)) {
        throw new Error(
          `The Secondary differs from its baseline ${firstMarkupDifference(baselineSecondaryHTML, current)}`,
        );
      }
    });
  },
};

/**
 * Attachments are UI-only (session-composer-design.md §1): Send must not clear them, which would
 * imply they were delivered, and the "local mock" note stays under the chips while any exist.
 */
export const AttachmentsStayAfterSend: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = await canvas.findByLabelText('Wiadomość');
    await expect(message).toBeEnabled();
    const input = canvasElement.querySelector<HTMLInputElement>(
      'input[type="file"]:not([accept])',
    )!;
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }));

    const chips = await canvas.findByLabelText('Załączniki');
    await expect(within(chips).getByText('notes.txt')).toBeVisible();
    const note = canvas.getByRole('note');
    await expect(note).toHaveTextContent('Makieta lokalna');

    await userEvent.type(message, 'Wyślij to');
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await waitFor(() => expect(message).toHaveValue(''));

    // Still there, with its note: nothing pretends the file was sent.
    await expect(within(canvas.getByLabelText('Załączniki')).getByText('notes.txt')).toBeVisible();
    await expect(canvas.getByRole('note')).toHaveTextContent('Makieta lokalna');
  },
};
