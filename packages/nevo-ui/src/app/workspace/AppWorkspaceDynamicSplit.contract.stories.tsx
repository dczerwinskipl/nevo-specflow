import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Typography } from '../../components';
import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { WorkspaceHeader } from './WorkspaceHeader';
import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';
import { WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH } from './workspaceSizing';

// End-to-end demonstrations of workspace-dynamic-split.md §5's transition table (W04), composed
// with W02's tab state (openTab/open/activateTab/closeTab) and W03's Secondary root-tab strip, at
// the representative widths `AppWorkspaceFit.contract.stories.tsx` already uses plus widths just
// above/below the new `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH + WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH`
// combined minimum (730px; exact-px boundary coverage lives in `workspaceSizing.test.ts` against
// the pure resolver directly). `mode: 'manual'` rows are covered there too, not here: entering
// `'manual'` requires a drag on `WorkspaceSplitter` (§4.3), which W05 (out of this task's scope)
// has not added yet.

const viewports = {
  w700: { name: '700', styles: { width: '700px', height: '800px' }, type: 'desktop' },
  w760: { name: '760', styles: { width: '760px', height: '800px' }, type: 'desktop' },
  w1108: { name: '1108', styles: { width: '1108px', height: '800px' }, type: 'desktop' },
  w1280: { name: '1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
  w1440: { name: '1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
  w1920: { name: '1920', styles: { width: '1920px', height: '1080px' }, type: 'desktop' },
  w2560: { name: '2560', styles: { width: '2560px', height: '1440px' }, type: 'desktop' },
} as const;

function Navigation() {
  return (
    <div className="p-4">
      <Typography className="text-content-muted" variant="label-sm">
        Navigation
      </Typography>
    </div>
  );
}

interface ItemPages {
  summary: Record<never, never>;
}

function itemStack(id: string, label: string) {
  return defineSecondaryStack<Record<never, never>, string, ItemPages>({
    id,
    initial: 'summary',
    useData: () => ({ status: 'ready', data: label }),
    screens: {
      summary: {
        title: label,
        component: () => (
          <div className="p-4" data-item-page={label}>
            <Typography variant="body-sm">{label}</Typography>
          </div>
        ),
      },
    },
  });
}

const dynamicItemA = itemStack('dynamic-split-item-a', 'Item A');
const dynamicItemB = itemStack('dynamic-split-item-b', 'Item B');
const legacySlotFirst = itemStack('dynamic-split-legacy', 'Legacy first open');
const legacySlotSecond = itemStack('dynamic-split-legacy', 'Legacy second open');

function DynamicSplitPrimaryContent({
  onSwapSides,
}: {
  /** W06: a product-owned action — `AppWorkspace` itself has no built-in "swap" control. */
  onSwapSides: () => void;
}) {
  const navigation = useSecondaryNavigation();

  return (
    <div className="grid gap-2 p-4">
      <Typography variant="body-sm">Primary conversation</Typography>
      <Button onClick={() => void navigation.openTab(dynamicItemA, {})} size="sm">
        Open Item A
      </Button>
      <Button onClick={() => void navigation.openTab(dynamicItemB, {})} size="sm">
        Open Item B
      </Button>
      <Button onClick={() => void navigation.open(legacySlotFirst, {})} size="sm">
        Open legacy slot
      </Button>
      <Button onClick={() => void navigation.open(legacySlotSecond, {})} size="sm">
        Replace legacy slot
      </Button>
      <Button onClick={onSwapSides} size="sm">
        Swap sides
      </Button>
    </div>
  );
}

function DynamicSplitFixture() {
  const [contextOpen, setContextOpen] = useState(true);
  // W05: tracked only so stories can assert on the resolver's own `mode` (uncontrolled
  // `secondaryRatio`/`onSecondaryRatioChange` still owns the actual value; this is read-only).
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  // W06: the fixture owns this exactly like `secondaryRatio` above — `AppWorkspace` never flips it
  // itself, only reports the effective value back (see `AppWorkspace`'s `onSecondarySideChange`
  // doc comment). The "Swap sides" button is this fixture's own product-level affordance.
  const [side, setSide] = useState<'start' | 'end'>('end');
  // A declarative Secondary host still registers its pinned tab explicitly (same pattern as
  // W03's own fixtures — see `useRegisterPinnedSecondaryTab`'s doc comment).
  useRegisterPinnedSecondaryTab(contextOpen ? { title: 'Context' } : null);

  return (
    <AppShell
      data-dynamic-split-mode={mode}
      data-dynamic-split-shell="true"
      data-dynamic-split-side={side}
      navigation={<Navigation />}
    >
      <AppWorkspace
        fit="available"
        onSecondaryRatioChange={(_ratio, nextMode) => setMode(nextMode)}
        onSecondarySideChange={setSide}
        secondarySide={side}
        split="dynamic"
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
          <DynamicSplitPrimaryContent
            onSwapSides={() => setSide((current) => (current === 'end' ? 'start' : 'end'))}
          />
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary
          header={<WorkspaceHeader title="Context" />}
          onOpenChange={setContextOpen}
          open={contextOpen}
        >
          <div className="p-4">
            <Typography variant="body-sm">Pinned context content</Typography>
          </div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

function DynamicSplitContract() {
  return (
    <AppWorkspaceProvider>
      <DynamicSplitFixture />
    </AppWorkspaceProvider>
  );
}

const meta = {
  title: 'Nevo UI/Internal/Workspace/Dynamic split',
  tags: ['contract', '!autodocs'],
  parameters: { layout: 'fullscreen', viewport: { options: viewports }, a11y: { test: 'off' } },
  render: () => <DynamicSplitContract />,
} satisfies Meta;
export default meta;
type Story = StoryObj;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function settle() {
  for (let frame = 0; frame < 6; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) {
      return result;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(message);
}

function regions(canvasElement: HTMLElement) {
  const shell = canvasElement.querySelector<HTMLElement>('[data-dynamic-split-shell]');
  assert(shell, 'The fixture should expose its application shell.');
  const layout = shell.querySelector<HTMLElement>('[data-workspace-fit]');
  const primary = shell.querySelector<HTMLElement>('[data-workspace-surface="primary"]');
  const secondary = shell.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
  assert(layout, 'The fixture exposes the resolved workspace layout.');

  return { shell, layout, primary, secondary };
}

/**
 * Activates a root tab by its label, working whether `ItemTabs` is currently showing the full
 * strip (`[role="tab"]`) or — item-tabs.md's narrow-width switcher collapse, which this Secondary
 * pane's own width can trigger well before any of this task's representative viewports count as
 * narrow — the single switcher button and its Opened menu (`[role="menuitem"]`).
 */
async function activateRootTab(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  label: string,
) {
  const directTab = [...canvasElement.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
    tab.textContent?.includes(label),
  );
  if (directTab) {
    await userEvent.click(directTab);

    return;
  }

  const switcherButton = canvasElement.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  assert(switcherButton, `Neither a tab nor the switcher button for "${label}" was found.`);
  await userEvent.click(switcherButton);
  const menu = await waitFor(
    () => document.querySelector<HTMLElement>('[role="menu"]'),
    'The switcher should open the Opened menu.',
  );
  const row = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => !item.textContent?.startsWith('Close ') && item.textContent?.includes(label),
  );
  assert(row, `The Opened menu should list "${label}".`);
  await userEvent.click(row);
}

/** Closes a root tab by its label, robust to the same strip/switcher presentations as {@link activateRootTab}. */
async function closeRootTab(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  label: string,
) {
  const directClose = canvasElement.querySelector<HTMLElement>(
    `button[aria-label="Close ${label}"]`,
  );
  if (directClose) {
    await userEvent.click(directClose);

    return;
  }

  const switcherButton = canvasElement.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  assert(
    switcherButton,
    `Neither a close button nor the switcher button for "${label}" was found.`,
  );
  await userEvent.click(switcherButton);
  const menu = await waitFor(
    () => document.querySelector<HTMLElement>('[role="menu"]'),
    'The switcher should open the Opened menu.',
  );
  const row = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.startsWith(`Close ${label}`),
  );
  assert(row, `The Opened menu should offer "Close ${label}".`);
  await userEvent.click(row);
}

/**
 * The full §5 sequence this task's own transition table requires, reusable at every
 * split-capable representative width: entering split with only the pinned tab open (narrow
 * default) -> `openTab()` opening a brand-new 2nd tab (one-time 50/50) -> `activateTab` switching
 * among open tabs (no resize) -> `closeTab()` down to just the pinned tab while `auto` (back to
 * the narrow default) -> `open()` creating its slot for the first time (also a brand-new tab, same
 * 50/50) -> `open()` replacing that slot's content in place while tab count stays unchanged (no
 * resize, distinct from the brand-new-tab case even though both land on 50/50) -> closing back
 * down to the narrow default again.
 */
async function verifyDynamicSplitTransitions(
  canvasElement: HTMLElement,
  canvas: { getByRole: (role: string, options: { name: string }) => HTMLElement },
  userEvent: { click: (element: Element) => Promise<void> },
  width: number,
) {
  await settle();
  assert(
    window.innerWidth === width,
    `Expected a ${width}px viewport, got ${window.innerWidth}px.`,
  );
  // Activating a different root tab remounts Secondary's `RuntimeSurfaceRegion` under a new `key`
  // (a new tab's own flow instance), so a DOM reference captured before that point goes stale —
  // every width check below re-queries `[data-workspace-surface="secondary"]` fresh instead of
  // reusing one captured node across a tab-count/active-tab change.
  function secondaryWidth(): number {
    const secondary = canvasElement.querySelector<HTMLElement>(
      '[data-workspace-surface="secondary"]',
    );
    assert(secondary, 'Secondary renders split beside Primary.');

    return secondary.getBoundingClientRect().width;
  }

  const { layout, primary } = regions(canvasElement);
  assert(primary, 'A split-capable dynamic workspace renders Primary.');
  assert(layout.dataset.layout === 'split', 'A wide-enough dynamic workspace starts split.');

  const narrowSecondaryWidth = secondaryWidth();
  assert(
    Math.abs(narrowSecondaryWidth - WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH) <= 1.5,
    `Entering with only the pinned tab open uses the narrow default (${narrowSecondaryWidth}).`,
  );

  const contentWidth = primary.getBoundingClientRect().width + narrowSecondaryWidth;

  // At most 2 tabs are ever open at once below: with 3 (pinned + 2 runtime), the Secondary pane's
  // own width at these representative widths is too narrow for `ItemTabs` to keep every tab as a
  // visible `[role="tab"]` (some would go to its "Opened (N)" overflow menu instead), which is
  // irrelevant to what this sequence is testing.

  // openTab() opening a brand-new 2nd tab (tab count +1) while auto: one-time switch to 50/50.
  await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
  await waitFor(
    () => (Math.abs(secondaryWidth() - contentWidth * 0.5) < 2 ? true : null),
    'Opening a brand-new 2nd tab must switch to 50/50.',
  );
  const fiftyFiftyWidth = secondaryWidth();

  // activateTab() switching among open tabs (tab count unchanged): no resize.
  await activateRootTab(canvasElement, userEvent, 'Context');
  await waitFor(
    () => (document.querySelector('[data-item-page="Item A"]') === null ? true : null),
    'Switching to the Context tab should show its own content.',
  );
  assert(
    Math.abs(secondaryWidth() - fiftyFiftyWidth) <= 1.5,
    'activateTab() switching among open tabs must not resize.',
  );

  // closeTab() reducing open tabs to just the pinned one while auto: back to the narrow default.
  await closeRootTab(canvasElement, userEvent, 'Item A');
  await waitFor(
    () =>
      document.querySelector('[role="tablist"]') === null &&
      document.querySelector('[aria-haspopup="menu"]') === null
        ? true
        : null,
    'Closing back down to just the pinned tab should remove the strip.',
  );
  await waitFor(
    () => (Math.abs(secondaryWidth() - narrowSecondaryWidth) <= 1.5 ? true : null),
    'closeTab() down to just the pinned tab while auto must return to the narrow default.',
  );

  // open() creating its slot for the first time (tab count +1): also a brand-new tab, same 50/50.
  await userEvent.click(canvas.getByRole('button', { name: 'Open legacy slot' }));
  await waitFor(
    () => document.querySelector('[data-item-page="Legacy first open"]'),
    'The legacy slot should open at its first definition.',
  );
  assert(
    Math.abs(secondaryWidth() - fiftyFiftyWidth) <= 1.5,
    'open() creating a brand-new 2nd tab must also switch to 50/50.',
  );

  // open() replacing its slot's content in place (tab count unchanged): no resize, distinct from
  // the brand-new-tab case just above even though both land on the same 50/50 value.
  await userEvent.click(canvas.getByRole('button', { name: 'Replace legacy slot' }));
  await waitFor(
    () => document.querySelector('[data-item-page="Legacy second open"]'),
    'Replacing the legacy slot should land on its second definition.',
  );
  assert(
    Math.abs(secondaryWidth() - fiftyFiftyWidth) <= 1.5,
    "open() replacing its slot's content in place (tab count unchanged) must not resize.",
  );

  // closeTab() reducing open tabs to just the pinned one again: back to the narrow default.
  await closeRootTab(canvasElement, userEvent, 'Legacy second open');
  await waitFor(
    () =>
      document.querySelector('[role="tablist"]') === null &&
      document.querySelector('[aria-haspopup="menu"]') === null
        ? true
        : null,
    'Closing back down to just the pinned tab should remove the strip.',
  );
  await waitFor(
    () => (Math.abs(secondaryWidth() - narrowSecondaryWidth) <= 1.5 ? true : null),
    'closeTab() down to just the pinned tab while auto must return to the narrow default.',
  );
}

export const EntersAndTransitions1108Contract: Story = {
  globals: { viewport: { value: 'w1108', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) =>
    verifyDynamicSplitTransitions(canvasElement, canvas, userEvent, 1108),
};

export const EntersAndTransitions1280Contract: Story = {
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) =>
    verifyDynamicSplitTransitions(canvasElement, canvas, userEvent, 1280),
};

export const EntersAndTransitions1440Contract: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) =>
    verifyDynamicSplitTransitions(canvasElement, canvas, userEvent, 1440),
};

export const EntersAndTransitions1920Contract: Story = {
  globals: { viewport: { value: 'w1920', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) =>
    verifyDynamicSplitTransitions(canvasElement, canvas, userEvent, 1920),
};

export const EntersAndTransitions2560Contract: Story = {
  globals: { viewport: { value: 'w2560', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) =>
    verifyDynamicSplitTransitions(canvasElement, canvas, userEvent, 2560),
};

/**
 * With only the pinned tab open, the Secondary surface is still the *declarative*
 * `AppWorkspace.Secondary` (contract §3 item 2 — the pinned entry has no flow of its own), whose
 * `canStack: false` keeps it gated by the existing generic `WORKSPACE_SPLIT_MIN_WIDTH` (840px)
 * regardless of `split="dynamic"`. Once a 2nd tab is `openTab()`-opened, the active surface
 * becomes a runtime tab (`canStack: true`), and from then on the dynamic resolver's own, narrower
 * combined minimum (730px) is what decides split vs. stacked — independent of the 840px gate.
 * These two stories open that 2nd tab first, then check the boundary just below/above 730px.
 */
async function openItemATab(
  canvas: { getByRole: (role: string, options: { name: string }) => HTMLElement },
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
  await waitFor(
    () => document.querySelector('[data-item-page="Item A"]'),
    'Item A should open and become active.',
  );
}

export const FallsBackToStackedBelowDynamicMinimumContract: Story = {
  globals: { viewport: { value: 'w700', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();
    assert(window.innerWidth === 700, `Expected a 700px viewport, got ${window.innerWidth}px.`);
    await openItemATab(canvas, userEvent);
    const { layout } = regions(canvasElement);
    assert(
      layout.dataset.layout === 'stacked',
      'A width that cannot fit both dynamic minimums falls back to the existing stacked path.',
    );
  },
};

export const EntersSplitAboveDynamicMinimumContract: Story = {
  globals: { viewport: { value: 'w760', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();
    assert(window.innerWidth === 760, `Expected a 760px viewport, got ${window.innerWidth}px.`);
    await openItemATab(canvas, userEvent);
    const { layout, secondary } = regions(canvasElement);
    assert(layout.dataset.layout === 'split', 'Above the combined minimum resolves to split.');
    assert(secondary, 'Secondary renders split beside Primary.');
  },
};

// W05 — `WorkspaceSplitter` wired into this `AppWorkspace`: pointer/touch drag committing
// `mode: 'manual'` (contract §4.3/§5/§7). `DynamicSplitFixture` reports the resolver's own `mode`
// on the shell (`data-dynamic-split-mode`) purely so these stories can assert on it; it does not
// change the fixture's rendered sizing for the stories above.

function workspaceSplitter(canvasElement: HTMLElement): HTMLElement {
  const splitter = canvasElement.querySelector<HTMLElement>('[data-workspace-splitter="true"]');
  assert(splitter, "A dynamic split in 'split' layout renders WorkspaceSplitter.");

  return splitter;
}

function secondaryWidthPx(canvasElement: HTMLElement): number {
  const secondary = canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"]',
  );
  assert(secondary, 'Secondary renders split beside Primary.');

  return secondary.getBoundingClientRect().width;
}

function dispatchPointer(target: Element, type: string, init: PointerEventInit) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
}

export const PointerDragEntersManualContract: Story = {
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement }) => {
    await settle();
    const { shell } = regions(canvasElement);
    assert(shell.dataset.dynamicSplitMode === 'auto', 'A dynamic split starts in auto mode.');

    const splitter = workspaceSplitter(canvasElement);
    assert(
      splitter.getAttribute('aria-valuenow') !== null,
      'WorkspaceSplitter reports a live aria-valuenow.',
    );
    const widthBeforeDrag = secondaryWidthPx(canvasElement);

    const rect = splitter.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    // Dragging left (pointerdown -> pointermove -> pointerup, not HTML5 drag-and-drop) grows
    // Secondary's share and must commit mode: 'manual' (contract §5 "User drags WorkspaceSplitter").
    dispatchPointer(splitter, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: startX,
      clientY,
    });
    dispatchPointer(splitter, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: startX - 120,
      clientY,
    });
    dispatchPointer(splitter, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: startX - 120,
      clientY,
    });
    await settle();

    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      "Dragging WorkspaceSplitter must commit mode: 'manual'.",
    );
    const widthAfterDrag = secondaryWidthPx(canvasElement);
    assert(
      widthAfterDrag > widthBeforeDrag + 40,
      `Dragging the splitter left must grow Secondary (before ${widthBeforeDrag}, after ${widthAfterDrag}).`,
    );
  },
};

export const TouchDragDoesNotScrollContract: Story = {
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement }) => {
    await settle();
    const splitter = workspaceSplitter(canvasElement);
    assert(
      getComputedStyle(splitter).touchAction === 'none',
      'The splitter hit area must disable the browser touch-scroll gesture (contract §7).',
    );

    const { layout } = regions(canvasElement);
    const widthBeforeDrag = secondaryWidthPx(canvasElement);
    const scrollTopBefore = layout.scrollTop;
    const windowScrollYBefore = window.scrollY;

    const rect = splitter.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    // A touch drag moves substantially in Y too (as a real finger would): it must resize the
    // split without scrolling the page or the workspace's own ancestors. Entering split with only
    // the pinned tab open starts at Secondary's own minimum ratio (the narrow default, §4.2/§5), so
    // the drag moves left (growing Secondary) rather than right, which would otherwise floor-clamp
    // immediately and never move.
    dispatchPointer(splitter, 'pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: startX,
      clientY: rect.top + 10,
    });
    dispatchPointer(splitter, 'pointermove', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: startX - 150,
      clientY: rect.top + 400,
    });
    dispatchPointer(splitter, 'pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      clientX: startX - 150,
      clientY: rect.top + 400,
    });
    await settle();

    const widthAfterDrag = secondaryWidthPx(canvasElement);
    assert(
      widthAfterDrag > widthBeforeDrag + 40,
      `A touch drag left must grow Secondary (before ${widthBeforeDrag}, after ${widthAfterDrag}).`,
    );
    assert(
      layout.scrollTop === scrollTopBefore,
      'A touch drag on the splitter must not scroll the workspace.',
    );
    assert(
      window.scrollY === windowScrollYBefore,
      'A touch drag on the splitter must not scroll the page.',
    );
  },
};

/**
 * The active tab's label and total open-tab count, robust to the same strip/switcher
 * presentations as {@link activateRootTab}/{@link closeRootTab}: with the strip collapsed to its
 * narrow-width switcher, there is no `[role="tab"]` at all, so the switcher's own label (which
 * encodes both the active item's label and the open count, see `ItemTabs.tsx`'s switcher button)
 * is the only place this information is observable in the DOM.
 */
function tabStripSummary(canvasElement: HTMLElement): { activeLabel: string; tabCount: number } {
  const tabs = [...canvasElement.querySelectorAll<HTMLElement>('[role="tab"]')];
  if (tabs.length > 0) {
    const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    assert(active, 'A tab should be active while the full tablist is shown.');

    return { activeLabel: active.textContent ?? '', tabCount: tabs.length };
  }

  const switcherButton = canvasElement.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  assert(switcherButton, 'Neither a tablist nor a switcher button was found.');
  const label = switcherButton.textContent ?? '';
  const countMatch = /\((\d+)\)$/.exec(label);
  assert(countMatch, `The switcher button should report its open count ("${label}").`);

  return { activeLabel: label.slice(0, countMatch.index).trim(), tabCount: Number(countMatch[1]) };
}

// W06 — side swap (contract §4.2 last bullet, §5 "secondarySide changes" row): everything the
// resolver/tab-set own (secondaryRatio, mode, tabs, activeTabId) must survive a swap unchanged;
// only layout order and which edge carries the divider border change. `AppWorkspace` itself has no
// built-in "swap" control (§6) — the fixture's own "Swap sides" button (`DynamicSplitFixture`
// above) is the product-owned trigger, exactly like a real consumer would render one.
export const SwapSidesPreservesTabsAndRatioContract: Story = {
  globals: { viewport: { value: 'w1280', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();
    const { shell } = regions(canvasElement);
    assert(shell.dataset.dynamicSplitSide === 'end', 'Secondary starts on the default end side.');

    // Real tab state to verify survives the swap: the pinned tab plus a 2nd, openTab()-opened tab.
    await openItemATab(canvas, userEvent);

    // A manual ratio to verify survives the swap too (contract §5 "User drags WorkspaceSplitter").
    const splitterBeforeSwap = workspaceSplitter(canvasElement);
    const dragRect = splitterBeforeSwap.getBoundingClientRect();
    const dragStartX = dragRect.left + dragRect.width / 2;
    const dragClientY = dragRect.top + dragRect.height / 2;
    dispatchPointer(splitterBeforeSwap, 'pointerdown', {
      pointerId: 3,
      pointerType: 'mouse',
      button: 0,
      clientX: dragStartX,
      clientY: dragClientY,
    });
    dispatchPointer(splitterBeforeSwap, 'pointermove', {
      pointerId: 3,
      pointerType: 'mouse',
      clientX: dragStartX - 80,
      clientY: dragClientY,
    });
    dispatchPointer(splitterBeforeSwap, 'pointerup', {
      pointerId: 3,
      pointerType: 'mouse',
      clientX: dragStartX - 80,
      clientY: dragClientY,
    });
    await settle();
    assert(shell.dataset.dynamicSplitMode === 'manual', 'The drag must commit mode: "manual".');

    const widthBeforeSwap = secondaryWidthPx(canvasElement);
    const summaryBeforeSwap = tabStripSummary(canvasElement);
    assert(summaryBeforeSwap.tabCount === 2, 'Both the pinned tab and Item A should be open.');
    const { primary: primaryBeforeSwap, secondary: secondaryBeforeSwap } = regions(canvasElement);
    assert(
      primaryBeforeSwap && secondaryBeforeSwap,
      'Secondary renders split beside Primary before the swap.',
    );
    const orderBeforeSwap = [...shell.querySelectorAll('[data-workspace-surface]')];
    assert(
      orderBeforeSwap.indexOf(primaryBeforeSwap) < orderBeforeSwap.indexOf(secondaryBeforeSwap),
      'Secondary renders after Primary at the default end side.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Swap sides' }));
    await settle();

    assert(shell.dataset.dynamicSplitSide === 'start', 'The side flips to "start".');
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'mode must survive the swap unchanged (still "manual").',
    );
    const widthAfterSwap = secondaryWidthPx(canvasElement);
    assert(
      Math.abs(widthAfterSwap - widthBeforeSwap) <= 1.5,
      `secondaryRatio must survive the swap unchanged (before ${widthBeforeSwap}, after ${widthAfterSwap}).`,
    );
    const summaryAfterSwap = tabStripSummary(canvasElement);
    assert(
      summaryAfterSwap.activeLabel === summaryBeforeSwap.activeLabel,
      'activeTabId must survive the swap unchanged.',
    );
    assert(
      summaryAfterSwap.tabCount === summaryBeforeSwap.tabCount,
      'tabs must survive the swap unchanged (same count, same set).',
    );

    const { primary: primaryAfterSwap, secondary: secondaryAfterSwap } = regions(canvasElement);
    assert(primaryAfterSwap && secondaryAfterSwap, 'Both regions still render after the swap.');
    // `WorkspaceSplitter` itself is the visual division for a dynamic split (no `border-l`/
    // `border-r` divider rendered alongside it — contract §4.3's framing, carried into the
    // `divider` prop on `RuntimeSurfaceRegion`); the fixed-preset divider-side flip (`border-l` <->
    // `border-r`) is covered directly in `AppWorkspace.test.tsx`. So this checks DOM order of all
    // three split-layout siblings (Secondary, the splitter, Primary) instead.
    const splitterAfterSwap = workspaceSplitter(canvasElement);
    const orderAfterSwap = [
      ...shell.querySelectorAll('[data-workspace-surface], [data-workspace-splitter]'),
    ];
    assert(
      orderAfterSwap.indexOf(secondaryAfterSwap) < orderAfterSwap.indexOf(splitterAfterSwap) &&
        orderAfterSwap.indexOf(splitterAfterSwap) < orderAfterSwap.indexOf(primaryAfterSwap),
      'Secondary, then WorkspaceSplitter, then Primary must render in that order once swapped to the start side.',
    );
  },
};

// ---------------------------------------------------------------------------------------------
// W07 — the full §5 transition table proven as ONE connected scenario, not the isolated
// per-trigger assertions above. Width is driven by a resizable wrapper (same technique as
// `WorkspaceHeader.stories.tsx`'s `ResizableHeader`) rather than a Storybook `viewport` global, so
// a single `play` function can shrink below, then widen back above, the dynamic minimums — a
// fixed per-story viewport cannot change mid-scenario. Every step reuses the exact same production
// API surface (`openTab`/`open`/`activateTab`/`closeTab`, `navTo`, the splitter, the header's
// close affordance, `secondarySide`) as the isolated stories above; nothing here is a new code
// path, only a new connected sequence through existing ones.
// ---------------------------------------------------------------------------------------------

interface ScenarioPages {
  summary: Record<never, never>;
  detail: Record<never, never>;
}

function scenarioStack(id: string, label: string) {
  return defineSecondaryStack<Record<never, never>, string, ScenarioPages>({
    id,
    initial: 'summary',
    useData: () => ({ status: 'ready', data: label }),
    screens: {
      summary: {
        title: label,
        component: () => {
          const nav = useSecondaryStack<ScenarioPages>();

          return (
            <div className="p-4" data-scenario-page={label}>
              <Typography variant="body-sm">{label}</Typography>
              <Button onClick={() => void nav.navTo('detail')} size="sm">
                Open {label} detail
              </Button>
            </div>
          );
        },
      },
      detail: {
        title: `${label} detail`,
        component: () => (
          <div className="p-4" data-scenario-detail-page={label}>
            <Typography variant="body-sm">{label} detail</Typography>
          </div>
        ),
      },
    },
  });
}

const scenarioItemA = scenarioStack('w07-scenario-item-a', 'Item A');
const scenarioItemB = scenarioStack('w07-scenario-item-b', 'Item B');

function ScenarioPrimaryContent({ onSwapSides }: { onSwapSides: () => void }) {
  const navigation = useSecondaryNavigation();

  return (
    <div className="grid gap-2 p-4">
      <Typography variant="body-sm">Primary conversation</Typography>
      <Button onClick={() => void navigation.openTab(scenarioItemA, {})} size="sm">
        Open Item A
      </Button>
      <Button onClick={() => void navigation.openTab(scenarioItemB, {})} size="sm">
        Open Item B
      </Button>
      <Button onClick={onSwapSides} size="sm">
        Swap sides
      </Button>
    </div>
  );
}

function ScenarioFixture({ width }: { width: number }) {
  const [contextOpen, setContextOpen] = useState(true);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [side, setSide] = useState<'start' | 'end'>('end');
  useRegisterPinnedSecondaryTab(contextOpen ? { title: 'Context' } : null);

  return (
    <div data-resizable-width style={{ width, maxWidth: '100%', height: 800 }}>
      <AppShell
        data-dynamic-split-mode={mode}
        data-dynamic-split-shell="true"
        data-dynamic-split-side={side}
        navigation={<Navigation />}
        style={{ height: '100%', width: '100%' }}
      >
        <AppWorkspace
          fit="available"
          onSecondaryRatioChange={(_ratio, nextMode) => setMode(nextMode)}
          onSecondarySideChange={setSide}
          secondarySide={side}
          split="dynamic"
        >
          <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
            <ScenarioPrimaryContent
              onSwapSides={() => setSide((current) => (current === 'end' ? 'start' : 'end'))}
            />
          </AppWorkspace.Primary>
          <AppWorkspace.Secondary
            header={<WorkspaceHeader title="Context" />}
            onOpenChange={setContextOpen}
            open={contextOpen}
          >
            <div className="p-4">
              <Typography variant="body-sm">Pinned context content</Typography>
            </div>
          </AppWorkspace.Secondary>
        </AppWorkspace>
      </AppShell>
    </div>
  );
}

function ScenarioContract() {
  const [width, setWidth] = useState(1280);

  return (
    <AppWorkspaceProvider>
      <div className="flex gap-2 p-2">
        <button data-testid="scenario-shrink" onClick={() => setWidth(700)} type="button">
          Shrink below dynamic minimums
        </button>
        <button data-testid="scenario-widen" onClick={() => setWidth(1280)} type="button">
          Widen back
        </button>
      </div>
      <ScenarioFixture width={width} />
    </AppWorkspaceProvider>
  );
}

export const FullConnectedScenarioContract: Story = {
  tags: ['contract', '!autodocs'],
  render: () => <ScenarioContract />,
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();

    // Step 1: enter split with only the pinned tab open (narrow default).
    const { shell, layout, primary } = regions(canvasElement);
    assert(primary, 'A split-capable dynamic workspace renders Primary.');
    assert(layout.dataset.layout === 'split', 'Step 1: entering split starts in split layout.');
    assert(
      shell.dataset.dynamicSplitMode === 'auto',
      'Step 1: a dynamic split starts in auto mode.',
    );
    const narrowWidth = secondaryWidthPx(canvasElement);
    assert(
      Math.abs(narrowWidth - WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH) <= 1.5,
      `Step 1: only the pinned tab open uses the narrow default (${narrowWidth}).`,
    );

    // Step 2: open a second root tab via openTab -> auto 50/50, once.
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => (secondaryWidthPx(canvasElement) > narrowWidth + 40 ? true : null),
      'Step 2: opening a brand-new 2nd tab must switch to 50/50.',
    );
    const fiftyFiftyWidth = secondaryWidthPx(canvasElement);

    // Step 3: switch tabs (no resize).
    await activateRootTab(canvasElement, userEvent, 'Context');
    await waitFor(
      () => (document.querySelector('[data-scenario-page="Item A"]') === null ? true : null),
      'Step 3: switching to Context should show its own content.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - fiftyFiftyWidth) <= 1.5,
      'Step 3: activateTab() switching among open tabs must not resize.',
    );
    await activateRootTab(canvasElement, userEvent, 'Item A');
    await waitFor(
      () => document.querySelector('[data-scenario-page="Item A"]'),
      'Step 3: switching back to Item A should show its own content.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - fiftyFiftyWidth) <= 1.5,
      'Step 3: switching back must not resize either.',
    );

    // Step 4: open a dependent detail inside Item A's local stack (no resize).
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A detail' }));
    await waitFor(
      () => document.querySelector('[data-scenario-detail-page="Item A"]'),
      'Step 4: pushing a dependent detail should navigate to it.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - fiftyFiftyWidth) <= 1.5,
      'Step 4: a push/pop inside a tab’s local stack must not resize (the resolver never sees it).',
    );

    // Step 5: drag the splitter -> manual wins.
    const splitterBeforeDrag = workspaceSplitter(canvasElement);
    const dragRect = splitterBeforeDrag.getBoundingClientRect();
    const dragStartX = dragRect.left + dragRect.width / 2;
    const dragClientY = dragRect.top + dragRect.height / 2;
    dispatchPointer(splitterBeforeDrag, 'pointerdown', {
      pointerId: 11,
      pointerType: 'mouse',
      button: 0,
      clientX: dragStartX,
      clientY: dragClientY,
    });
    dispatchPointer(splitterBeforeDrag, 'pointermove', {
      pointerId: 11,
      pointerType: 'mouse',
      clientX: dragStartX - 100,
      clientY: dragClientY,
    });
    dispatchPointer(splitterBeforeDrag, 'pointerup', {
      pointerId: 11,
      pointerType: 'mouse',
      clientX: dragStartX - 100,
      clientY: dragClientY,
    });
    await settle();
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'Step 5: dragging must commit mode: "manual".',
    );
    const manualWidth = secondaryWidthPx(canvasElement);
    assert(
      manualWidth > fiftyFiftyWidth + 40,
      `Step 5: dragging left must grow Secondary (before ${fiftyFiftyWidth}, after ${manualWidth}).`,
    );

    // Step 6: open/close further tabs — manual ratio preserved throughout.
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item B' }));
    await waitFor(
      () => document.querySelector('[data-scenario-page="Item B"]'),
      'Step 6: Item B should open and become active.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 6: opening a brand-new tab while manual must not trigger an automatic 50/50.',
    );
    await closeRootTab(canvasElement, userEvent, 'Item B');
    await waitFor(
      () => (tabStripSummary(canvasElement).tabCount === 2 ? true : null),
      'Step 6: closing Item B should leave exactly the pinned tab and Item A open.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 6: closeTab() while manual must preserve the manual ratio.',
    );
    // closeTab()'s neighbour-selection rule (right neighbour, else left) must win over the pinned
    // tab: Item B (the closed, active tab) had no right neighbour, so closing it activates its
    // left neighbour, Item A, directly — the pinned tab is only the fallback when no runtime tab
    // remains at all (contract §4.1/§5). No explicit re-activation should be needed.
    await waitFor(
      () => document.querySelector('[data-scenario-detail-page="Item A"]'),
      'Step 6: closing Item B should re-activate Item A (its left neighbour), still on its pushed detail page.',
    );
    assert(
      tabStripSummary(canvasElement).activeLabel.includes('Item A'),
      'Step 6: Item A, not the pinned tab, must be the active tab after closing its right neighbour Item B.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 6: the neighbour re-activation that follows closeTab() while manual must not resize either.',
    );

    // Step 7: swap sides — everything the resolver/tab-set own survives unchanged.
    assert(
      shell.dataset.dynamicSplitSide === 'end',
      'Step 7: Secondary starts on the default end side.',
    );
    const summaryBeforeSwap = tabStripSummary(canvasElement);
    const { primary: primaryBeforeSwap, secondary: secondaryBeforeSwap } = regions(canvasElement);
    assert(
      primaryBeforeSwap && secondaryBeforeSwap,
      'Secondary renders split beside Primary before the swap.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Swap sides' }));
    await settle();
    assert(shell.dataset.dynamicSplitSide === 'start', 'Step 7: the side flips to "start".');
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'Step 7: mode must survive the swap unchanged.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 7: secondaryRatio must survive the swap unchanged.',
    );
    const summaryAfterSwap = tabStripSummary(canvasElement);
    assert(
      summaryAfterSwap.activeLabel === summaryBeforeSwap.activeLabel &&
        summaryAfterSwap.tabCount === summaryBeforeSwap.tabCount,
      'Step 7: tabs/activeTabId must survive the swap unchanged.',
    );

    // Step 8: close Secondary (the whole region) -> reopen (restored). With a pinned tab still
    // registered and open, closing the active *runtime* tab's own flow (contract §9 item 3's
    // `isOpen: false`) falls back to showing the pinned entry instead of leaving Secondary fully
    // empty (that fully-empty case, with no pinned tab at all, is `NoPinnedTabDynamicSplitContract`
    // below) — but the tab set, `activeTabId`, `mode` and the manual ratio are all still retained
    // unseen, exactly as §5 requires, which is what this step actually verifies.
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    await waitFor(
      () => (document.querySelector('[data-scenario-detail-page="Item A"]') === null ? true : null),
      'Step 8: closing the whole region should stop rendering the active runtime tab’s content.',
    );
    assert(
      canvasElement.textContent?.includes('Pinned context content'),
      'Step 8: closing the active runtime tab’s region falls back to the pinned tab’s own content.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 8: the manual ratio must be retained, not discarded, while the region is closed.',
    );
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'Step 8: mode must be retained, not discarded, while the region is closed.',
    );
    // Reopen by re-activating the exact tab that was open when closed (tab count/identity
    // unchanged — the "reopened" row, not a brand-new-tab 50/50 switch).
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => document.querySelector('[data-scenario-detail-page="Item A"]'),
      'Step 8: reopening should restore Item A as the active tab.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - manualWidth) <= 1.5,
      'Step 8: reopening must restore the exact manual ratio it had when closed.',
    );
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'Step 8: reopening must restore "manual" mode.',
    );

    // Step 9: shrink below the dynamic minimums -> falls back to the existing stacked/narrow path.
    await userEvent.click(canvas.getByTestId('scenario-shrink'));
    await waitFor(
      () => (regions(canvasElement).layout.dataset.layout === 'stacked' ? true : null),
      'Step 9: a width that cannot fit both dynamic minimums must fall back to stacked.',
    );

    // Step 10: widen back -> restores the clamped manual ratio, not the auto default.
    await userEvent.click(canvas.getByTestId('scenario-widen'));
    await waitFor(
      () => (regions(canvasElement).layout.dataset.layout === 'split' ? true : null),
      'Step 10: widening back above the dynamic minimums must re-enter split.',
    );
    const widthAfterWiden = secondaryWidthPx(canvasElement);
    assert(
      Math.abs(widthAfterWiden - manualWidth) <= 1.5,
      `Step 10: widening back to the same width must restore the same clamped manual ratio (before ${manualWidth}, after ${widthAfterWiden}).`,
    );
    assert(
      shell.dataset.dynamicSplitMode === 'manual',
      'Step 10: widening back must not reset mode to "auto".',
    );
  },
};

// A dynamic split with no `AppWorkspace.Secondary` declared at all (contract §4.1/§9 item 2):
// Secondary's whole existence is driven purely by `openTab`/`open`, including tearing down to
// nothing when the last tab closes and coming back when one opens again.
const soloItemA = scenarioStack('w07-solo-item-a', 'Item A');
const soloItemB = scenarioStack('w07-solo-item-b', 'Item B');

function NoPinnedTabDynamicSplitFixture() {
  const navigation = useSecondaryNavigation();

  return (
    <AppShell data-no-pinned-dynamic-shell="true" navigation={<Navigation />}>
      <AppWorkspace fit="available" split="dynamic">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
          <div className="grid gap-2 p-4">
            <Button onClick={() => void navigation.openTab(soloItemA, {})} size="sm">
              Open Item A
            </Button>
            <Button onClick={() => void navigation.openTab(soloItemB, {})} size="sm">
              Open Item B
            </Button>
          </div>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppShell>
  );
}

function NoPinnedTabDynamicSplitContractFixture() {
  return (
    <AppWorkspaceProvider>
      <NoPinnedTabDynamicSplitFixture />
    </AppWorkspaceProvider>
  );
}

export const NoPinnedTabDynamicSplitContract: Story = {
  globals: { viewport: { value: 'w1280', isRotated: false } },
  tags: ['contract', '!autodocs'],
  render: () => <NoPinnedTabDynamicSplitContractFixture />,
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();
    const shell = canvasElement.querySelector<HTMLElement>('[data-no-pinned-dynamic-shell]');
    assert(shell, 'The fixture should expose its application shell.');
    assert(
      shell.querySelector('[data-workspace-surface="secondary"]') === null,
      'With nothing open and no pinned tab, Secondary must not render at all.',
    );

    // Sole tab (open()/openTab()-only case): narrow default, no strip (contract §4.1 last bullet).
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => shell.querySelector('[data-workspace-surface="secondary"]'),
      'Opening the sole tab should render Secondary.',
    );
    assert(
      shell.querySelector('[role="tablist"]') === null,
      'A single openTab()-opened tab with no pinned tab must render no strip.',
    );
    const narrowWidth = secondaryWidthPx(canvasElement);
    assert(
      Math.abs(narrowWidth - WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH) <= 1.5,
      'The sole tab also uses the narrow default, not 50/50.',
    );

    // A second tab -> the strip (or its narrow-width switcher collapse, item-tabs.md) appears and
    // both are closable; also switches to 50/50.
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item B' }));
    await waitFor(
      () =>
        shell.querySelector('[role="tab"]') || shell.querySelector('[aria-haspopup="menu"]')
          ? true
          : null,
      'Two openTab()-opened tabs with no pinned tab should render the strip.',
    );
    assert(
      tabStripSummary(canvasElement).tabCount === 2,
      'Both openTab()-opened tabs should be open, with no pinned tab synthesized.',
    );
    await waitFor(
      () => (secondaryWidthPx(canvasElement) > narrowWidth + 40 ? true : null),
      'A brand-new 2nd tab must switch to 50/50 even with no pinned tab.',
    );

    // Closing back down to the sole tab removes the strip and restores the narrow default.
    await closeRootTab(canvasElement, userEvent, 'Item B');
    await waitFor(
      () =>
        shell.querySelector('[role="tablist"]') === null &&
        shell.querySelector('[aria-haspopup="menu"]') === null
          ? true
          : null,
      'Closing back down to one tab should remove the strip.',
    );
    await waitFor(
      () => (Math.abs(secondaryWidthPx(canvasElement) - narrowWidth) <= 1.5 ? true : null),
      'Closing back down to the sole tab should restore the narrow default.',
    );

    // Closing the whole region (the ordinary Secondary header close action — with only one tab
    // open, no strip/switcher renders at all, §4.1 last bullet, so there is no per-tab "x" here)
    // hides Secondary entirely: with no pinned tab to fall back to, `hasSecondary` becomes false
    // and nothing renders (contract §4.1/§9 item 2). The tab itself is retained, hidden, not
    // discarded (§5 "Secondary explicitly closed"), distinct from `closeTab()` actually removing
    // the last tab (§5's other row, covered directly in workspaceSizing.test.ts/WorkspaceContext
    // .test.tsx) — both leave `openTabCount<=1`, so the narrow-default math below holds either way.
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    await waitFor(
      () => shell.querySelector('[data-workspace-surface="secondary"]') === null,
      'Closing the whole region with no pinned tab must leave Secondary absent, not an empty shell.',
    );

    // Reopening (openTab re-activates the same retained-but-hidden tab) brings it back at the
    // narrow default.
    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => shell.querySelector('[data-workspace-surface="secondary"]'),
      'Opening a tab again should bring Secondary back.',
    );
    assert(
      Math.abs(secondaryWidthPx(canvasElement) - narrowWidth) <= 1.5,
      'Coming back from nothing re-enters at the narrow default, exactly like the very first entry.',
    );
  },
};
