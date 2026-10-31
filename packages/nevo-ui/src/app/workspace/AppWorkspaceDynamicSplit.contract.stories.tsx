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

function DynamicSplitPrimaryContent() {
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
    </div>
  );
}

function DynamicSplitFixture() {
  const [contextOpen, setContextOpen] = useState(true);
  // W05: tracked only so stories can assert on the resolver's own `mode` (uncontrolled
  // `secondaryRatio`/`onSecondaryRatioChange` still owns the actual value; this is read-only).
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  // A declarative Secondary host still registers its pinned tab explicitly (same pattern as
  // W03's own fixtures — see `useRegisterPinnedSecondaryTab`'s doc comment).
  useRegisterPinnedSecondaryTab(contextOpen ? { title: 'Context' } : null);

  return (
    <AppShell
      data-dynamic-split-mode={mode}
      data-dynamic-split-shell="true"
      navigation={<Navigation />}
    >
      <AppWorkspace
        fit="available"
        onSecondaryRatioChange={(_ratio, nextMode) => setMode(nextMode)}
        split="dynamic"
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
          <DynamicSplitPrimaryContent />
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
