import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
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

const WIDE_VIEWPORT = { viewport: { value: 'desktop1440', isRotated: false } };

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
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
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
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const Unavailable: Story = {
  args: {
    api: fixtureApi(unavailableSnapshot()),
    sessionContext: unavailableContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
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
