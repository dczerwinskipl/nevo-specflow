import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  longConversationLastMessage,
  longConversationSnapshot,
  singleTaskSnapshot,
  terminalFailureSnapshot,
  unavailableSnapshot,
  waitingWithoutAttentionSnapshot,
} from './managedSession.fullSession.stories-support';
import {
  genericSpecLevelContext,
  pendingInteractionContext,
  singleTaskContext,
  terminalOutcomeContext,
  unavailableContext,
  waitingWithoutAttentionContext,
} from './context/sessionContextFixtures';

/**
 * Full Session states required by this pass (owner decision 2):
 * generic/spec-level (§12), single-Task (§13), pending interaction (§15),
 * waiting-without-attention (§18), terminal failure/cancel/interrupt (§19), unavailable (§20).
 * Each story composes the real `ManagedSession` screen (Primary conversation + Context Secondary)
 * from a representative canonical `SessionSnapshot` plus a product-owned Context mock view model
 * (`sessionContextFixtures.ts`) — Context has no real backend projection yet, see the Full Session
 * UX report for that flagged dependency.
 */
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

/** Full Session §3.4 / acceptance check §24.2: on a split-capable (wide) layout, closing the
 * Context Secondary via its own close control must leave behind a visible, clickable way to
 * reopen it — not only on narrow layouts. Verifies the regression is fixed in every Full Session
 * state story below, at a wide (1440px) viewport.
 */
async function verifyContextReopens(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const doc = canvasElement.ownerDocument;
  const closeLabel = 'Zamknij panel dodatkowy';
  const reopenLabel = 'Kontekst';
  await expect(await canvas.findByRole('button', { name: closeLabel })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: closeLabel }));
  await waitFor(() =>
    expect(canvas.queryByRole('button', { name: closeLabel })).not.toBeInTheDocument(),
  );
  // The reopen control sits in the Primary header's "More actions" menu budget (not a direct
  // action), the same established pattern as the pre-existing narrow-mode Context action.
  await userEvent.click(await canvas.findByRole('button', { name: 'More actions' }));
  const reopen = await within(doc.body).findByRole('menuitem', { name: reopenLabel });
  await userEvent.click(reopen);
  await waitFor(() => expect(canvas.getByRole('button', { name: closeLabel })).toBeVisible());
}

/**
 * Item 1 regression: the floating composer overlay (composer + any pending-interaction card +
 * the "jump to latest" pill, all siblings under the same `data-composer-overlay` node) is
 * measured and reserved as the scroller's own `padding-bottom`, so the last message is never
 * hidden behind it. The audit's original bug left `padding-bottom` stuck at `null`/unset forever
 * (the `ResizeObserver` was never attached — see `ManagedSession.tsx`'s `composerOverlayNode`
 * callback ref); this asserts the real mechanism, not just "renders without crashing": the
 * reserved padding must actually cover the overlay's measured height, and no conversation entry
 * may render behind the overlay's own screen-space rectangle.
 */
async function verifyComposerOverlayPadding(canvasElement: HTMLElement) {
  const scroller = await waitFor(() => {
    const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
    if (!node) {
      throw new Error('Expected the message scroller.');
    }

    return node;
  });
  const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]');
  if (!overlay) {
    throw new Error('Expected the floating composer overlay.');
  }

  // One retrying check (not a bare assertion): right after mount/layout, the `ResizeObserver`'s
  // first measurement, the scroll-to-bottom effect, and (on this fixture) the auto-load-older
  // effect (item 5) can all still be settling, so an immediate read would be a false negative,
  // not a real regression.
  await waitFor(() => {
    const paddingBottom = parseFloat(getComputedStyle(scroller).paddingBottom || '0');
    const overlayRect = overlay.getBoundingClientRect();
    if (!(overlayRect.height > 0)) {
      throw new Error('Expected the composer overlay to have a measured height.');
    }

    if (!(paddingBottom >= overlayRect.height - 1)) {
      throw new Error(
        `Expected the scroller's padding-bottom (${paddingBottom}px) to reserve the full ` +
          `floating overlay height (${overlayRect.height}px) — it must never stay unset/0 while ` +
          'the overlay (composer + pending-interaction card) is taller than the bare composer.',
      );
    }

    // The actual overlap condition the audit described (visible at narrow width): no entry
    // actually inside the scroller's own visible, clipped viewport may render behind the
    // floating overlay's screen-space rectangle. An entry scrolled out of that clipped area
    // (`overflow-y-auto`) is merely off-screen, not hidden behind anything — the padding only
    // has to keep the *visible* window clear.
    const scrollerRect = scroller.getBoundingClientRect();
    for (const entry of canvasElement.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      if (insideVisibleWindow && rect.bottom > overlayRect.top) {
        throw new Error(`Entry "${entry.dataset.entryId}" renders behind the floating overlay.`);
      }
    }
  });
}

const WIDE_VIEWPORT = { viewport: { value: 'desktop1440', isRotated: false } };
const NARROW_VIEWPORT = { viewport: { value: 'mobile1', isRotated: false } };

const meta = {
  title: 'SpecFlow/Screens/Managed Session/Full Session states',
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
    owner: 'full-session-story',
    api: fixtureApi(sessionFixture()),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GenericSpecLevel: Story = {
  args: {
    api: fixtureApi(genericSpecLevelSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const SingleTaskExecution: Story = {
  args: {
    api: fixtureApi(singleTaskSnapshot()),
    sessionContext: singleTaskContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const PendingInteraction: Story = {
  args: {
    api: fixtureApi(sessionFixture(true)),
    sessionContext: pendingInteractionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyComposerOverlayPadding(canvasElement);
    await verifyContextReopens(canvasElement);
  },
};

/** Same state at the narrow width the audit specifically flagged as visibly broken: the
 * interaction card + composer overlay rendering directly on top of the assistant's answer. */
export const PendingInteractionNarrow: Story = {
  args: {
    api: fixtureApi(sessionFixture(true)),
    sessionContext: pendingInteractionContext(),
  },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    // The static `globals.viewport` resize is asynchronous; this geometry assertion needs the
    // 390px layout and the `ResizeObserver`/scroll corrections it drives to be fully settled
    // first, the same `settleViewport` convention other geometry-sensitive stories already use.
    await settleViewport(390, 844);
    await verifyComposerOverlayPadding(canvasElement);
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

export const WaitingWithoutAttention: Story = {
  args: {
    api: fixtureApi(waitingWithoutAttentionSnapshot()),
    sessionContext: waitingWithoutAttentionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const TerminalFailure: Story = {
  args: {
    api: fixtureApi(terminalFailureSnapshot()),
    sessionContext: terminalOutcomeContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyContextReopens(canvasElement);
    const canvas = within(canvasElement);
    // Item 2 regression: the Task's "Still active — no recovery required yet." attention item
    // means no action is needed, so its icon/tone must read as informational ("Do Twojej
    // wiadomości"), not as a contradictory "needs attention" warning.
    const attentionItem = (
      await canvas.findByText('Still active — no recovery required yet.')
    ).closest('li');
    if (!attentionItem) {
      throw new Error('Expected the attention item list entry.');
    }

    await expect(
      within(attentionItem).getByRole('img', { name: 'Do Twojej wiadomości' }),
    ).toBeInTheDocument();
    await expect(
      within(attentionItem).queryByRole('img', { name: 'Wymaga uwagi' }),
    ).not.toBeInTheDocument();

    // Item 4 regression: the outcome entry's icon names the specific outcome, not the generic
    // entry-kind label every outcome used to share.
    const outcomeEntry = canvasElement.querySelector('[data-entry-id="outcome-1"]');
    if (!outcomeEntry) {
      throw new Error('Expected the terminal outcome entry.');
    }

    await expect(
      within(outcomeEntry as HTMLElement).getByRole('img', { name: 'Niepowodzenie' }),
    ).toBeInTheDocument();
  },
};

export const Unavailable: Story = {
  args: {
    api: fixtureApi(unavailableSnapshot()),
    sessionContext: unavailableContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyContextReopens(canvasElement);
    const canvas = within(canvasElement);
    // Item 3 regression: the Send icon button must visually read as disabled too, matching the
    // already-disabled composer textarea — not stay rendered in the bold `primary` treatment an
    // actionable Send normally gets.
    const sendButton = canvas.getByRole('button', { name: 'Wyślij' });
    await expect(sendButton).toBeDisabled();
    await expect(sendButton.className).not.toMatch(/bg-action-primary\b/);
    await expect(sendButton.className).toMatch(/bg-action-secondary\b/);
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
 * regression-check standard, `verifyContextReopens`'s sibling check above).
 */
export const RelatedTaskOpensAsIndependentTab: Story = {
  args: {
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

    // Close the Task tab: the strip disappears, back to the single-pinned-tab baseline.
    await closeRootTab(canvasElement, 'Zadanie');
    await waitFor(() => expect(hasRootTabStrip(canvasElement)).toBe(false));
    await waitFor(() => expect(secondaryRegion()?.outerHTML).toBe(baselineSecondaryHTML));
  },
};
