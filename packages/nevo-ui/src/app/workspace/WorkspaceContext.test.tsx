// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.scrollTo ??= () => undefined;
  window.scrollTo = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const labels = { moreActions: 'Screen actions' };
function stackWith(menu?: 'complete') {
  return defineSecondaryStack<
    Record<never, never>,
    { ready: true },
    { page: Record<never, never> }
  >({
    id: menu ? 'menu-complete' : 'menu-default',
    initial: 'page',
    useData: () => ({ status: 'ready', data: { ready: true } }),
    screens: {
      page: {
        title: 'Editor',
        component: () => <p>Stack content</p>,
        actionLabels: labels,
        menu,
        actions: () => [
          { id: 'save', label: 'Save', primary: true, direct: 'always', onPress: () => undefined },
          {
            id: 'path',
            label: 'Show path',
            icon: 'info',
            group: 'actions',
            onPress: () => undefined,
          },
        ],
      },
    },
  });
}

const flags: { isOpen: boolean[] } = { isOpen: [] };
let close: () => Promise<boolean> = () => Promise.resolve(false);
function Host({
  stack,
  stackedClose,
}: {
  stack: ReturnType<typeof stackWith>;
  stackedClose?: 'show' | 'hide';
}) {
  const navigation = useSecondaryNavigation();
  flags.isOpen.push(navigation.isOpen);
  close = navigation.close;

  return (
    <AppWorkspace split="primary" stackedSecondaryClose={stackedClose}>
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        <button type="button" onClick={() => void navigation.open(stack, {})}>
          Open stack
        </button>
        <output data-testid="open">{String(navigation.isOpen)}</output>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

function mount(stack: ReturnType<typeof stackWith>, stackedClose?: 'show' | 'hide') {
  flags.isOpen = [];
  render(
    <AppWorkspaceProvider>
      <AppShell navigation={<div>Nav</div>}>
        <Host stack={stack} stackedClose={stackedClose} />
      </AppShell>
    </AppWorkspaceProvider>,
  );
}

const openStack = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText('Open stack'));
    await Promise.resolve();
  });
  await screen.findByText('Stack content');
};

const menuOf = (index = 0) => {
  const trigger = screen.getAllByRole('button', { name: 'Screen actions', hidden: true })[index]!;
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });

  return screen.getByRole('menu');
};

describe('useSecondaryNavigation().isOpen', () => {
  it('is false before opening, true once open and false as soon as it closes', async () => {
    mount(stackWith());
    expect(screen.getByTestId('open').textContent).toBe('false');
    await openStack();
    expect(screen.getByTestId('open').textContent).toBe('true');
    await act(async () => {
      await close();
    });
    expect(screen.getByTestId('open').textContent).toBe('false');
  });
});

describe('screen definition menu', () => {
  it('lists every action in the in-flow header menu with menu complete', async () => {
    mount(stackWith('complete'));
    await openStack();
    const menu = menuOf();
    expect(within(menu).getByRole('menuitem', { name: 'Save' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Show path' })).toBeTruthy();
    expect(menu.querySelector('[role="group"]')).not.toBeNull();
  });

  it('passes it to the compact floating row as well', async () => {
    mount(stackWith('complete'));
    await openStack();
    const triggers = screen.getAllByRole('button', { name: 'Screen actions', hidden: true });
    expect(triggers.length).toBeGreaterThan(1);
    const menu = menuOf(triggers.length - 1);
    expect(within(menu).getByRole('menuitem', { name: 'Show path' })).toBeTruthy();
    expect(menu.querySelector('[role="group"]')).not.toBeNull();
  });

  it('keeps the overflow-only menu without it', async () => {
    mount(stackWith());
    await openStack();
    const menu = menuOf();
    expect(within(menu).queryByRole('menuitem', { name: 'Save' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Show path' })).toBeTruthy();
    expect(menu.querySelector('[role="group"]')).toBeNull();
  });
});

describe('stackedSecondaryClose', () => {
  const closeButtons = () =>
    screen.queryAllByRole('button', { name: 'Close secondary content', hidden: true });

  it('keeps the close action in a stacked Secondary by default', async () => {
    mount(stackWith());
    await openStack();
    expect(closeButtons().length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Back', hidden: true }).length).toBeGreaterThan(0);
  });

  it('hides the duplicate close action of a stacked Secondary, and keeps Back', async () => {
    mount(stackWith(), 'hide');
    await openStack();
    expect(closeButtons()).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Back', hidden: true }).length).toBeGreaterThan(0);
    // The compact row loses the close item too.
    const menu = menuOf(
      screen.getAllByRole('button', { name: 'Screen actions', hidden: true }).length - 1,
    );
    expect(within(menu).queryByRole('menuitem', { name: 'Close secondary content' })).toBeNull();
  });
});

describe('W02: Secondary root-tab state', () => {
  interface ItemParams {
    itemId: string;
  }
  interface ItemPages {
    details: Record<never, never>;
    extra: Record<never, never>;
  }

  let mountCounts: Record<string, number>;
  let capturedStacks: Record<string, ReturnType<typeof useSecondaryStack<ItemPages>>>;

  function ItemDetails({ data: itemId }: { data: string }) {
    const stack = useSecondaryStack<ItemPages>();
    mountCounts[`${itemId}:details`] = (mountCounts[`${itemId}:details`] ?? 0) + 1;
    capturedStacks[itemId] = stack;

    return (
      <div>
        <p>Item {itemId} details</p>
        <button type="button" onClick={() => void stack.navTo('extra')}>
          {`Push extra for ${itemId}`}
        </button>
      </div>
    );
  }

  function ItemExtra({ data: itemId }: { data: string }) {
    const stack = useSecondaryStack<ItemPages>();
    mountCounts[`${itemId}:extra`] = (mountCounts[`${itemId}:extra`] ?? 0) + 1;
    capturedStacks[itemId] = stack;

    return <p>Item {itemId} extra</p>;
  }

  const itemStack = defineSecondaryStack<ItemParams, string, ItemPages>({
    id: 'item',
    initial: 'details',
    instanceId: (params) => params.itemId,
    // Lets each openTab()-opened instance carry the opened entity's own name in the tab strip
    // (contract item-tabs.md's `name (N)` switcher): without this, every "item" tab would show the
    // identical static per-screen `title` below ("Item details") regardless of which item is open.
    tabLabel: (params) => `Item ${params.itemId}`,
    useData: (params) => ({ status: 'ready', data: params.itemId }),
    screens: {
      details: { title: 'Item details', component: ItemDetails },
      extra: { title: 'Item extra', component: ItemExtra },
    },
  });

  function pageStack(id: string, label: string) {
    return defineSecondaryStack<Record<never, never>, string, { page: Record<never, never> }>({
      id,
      initial: 'page',
      useData: () => ({ status: 'ready', data: label }),
      screens: {
        page: { title: label, component: () => <p>{label} content</p> },
      },
    });
  }

  function TabsHost({ pinned }: { scope?: string; pinned?: boolean }) {
    const navigation = useSecondaryNavigation();
    if (pinned) {
      useRegisterPinnedSecondaryTab({ title: 'Pinned' });
    }

    return (
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <div className="grid gap-2 p-4">
            <button
              type="button"
              onClick={() => void navigation.openTab(itemStack, { itemId: 'a' })}
            >
              openTab a
            </button>
            <button
              type="button"
              onClick={() => void navigation.openTab(itemStack, { itemId: 'b' })}
            >
              openTab b
            </button>
            <button
              type="button"
              onClick={() => void navigation.openTab(itemStack, { itemId: 'c' })}
            >
              openTab c
            </button>
            <button type="button" onClick={() => void navigation.open(pageStack('one', 'One'), {})}>
              open one
            </button>
            <button type="button" onClick={() => void navigation.open(pageStack('two', 'Two'), {})}>
              open two
            </button>
            <button type="button" onClick={() => void navigation.close()}>
              close region
            </button>
            {navigation.tabs.tabs.map((tab) => (
              <div key={tab.id}>
                <button type="button" onClick={() => void navigation.activateTab(tab.id)}>
                  activate {tab.id}
                </button>
                <button type="button" onClick={() => void navigation.closeTab(tab.id)}>
                  closeTab {tab.id}
                </button>
              </div>
            ))}
            <output data-testid="tab-ids">
              {navigation.tabs.tabs.map((tab) => tab.id).join(',')}
            </output>
            <output data-testid="tab-titles">
              {navigation.tabs.tabs.map((tab) => tab.title).join(',')}
            </output>
            <output data-testid="tab-closable">
              {navigation.tabs.tabs.map((tab) => String(tab.closable)).join(',')}
            </output>
            <output data-testid="active-tab">{navigation.tabs.activeTabId ?? ''}</output>
            <output data-testid="is-open">{String(navigation.isOpen)}</output>
          </div>
        </AppWorkspace.Primary>
      </AppWorkspace>
    );
  }

  function mountTabs(props: { scope?: string; pinned?: boolean } = {}) {
    mountCounts = {};
    capturedStacks = {};

    return render(
      <AppWorkspaceProvider scopeKey={props.scope}>
        <AppShell navigation={<div>Nav</div>}>
          <TabsHost {...props} />
        </AppShell>
      </AppWorkspaceProvider>,
    );
  }

  const tabIds = () => (screen.getByTestId('tab-ids').textContent ?? '').split(',').filter(Boolean);
  const tabTitles = () =>
    (screen.getByTestId('tab-titles').textContent ?? '').split(',').filter(Boolean);
  const activeTab = () => screen.getByTestId('active-tab').textContent;
  const isOpen = () => screen.getByTestId('is-open').textContent === 'true';
  const click = async (name: string) => {
    await act(async () => {
      // Primary becomes `inert` once a stacked Secondary is active (jsdom has no real layout
      // width, so `AppWorkspace` renders stacked): include it in the query regardless.
      fireEvent.click(screen.getByRole('button', { name, hidden: true }));
      await Promise.resolve();
    });
  };

  it("open() replaces its one slot in place on every call, regardless of definition/params (no behavior change from today's single flow)", async () => {
    mountTabs();
    await click('open one');
    expect(tabIds()).toHaveLength(1);
    expect(screen.getByText('One content')).toBeTruthy();
    const slotId = tabIds()[0];

    await click('open two');
    expect(tabIds()).toHaveLength(1);
    expect(tabIds()[0]).toBe(slotId); // Same slot, not a second tab.
    expect(screen.getByText('Two content')).toBeTruthy();
  });

  it('openTab opens a brand-new tab for a new instance id, and re-activates (without resetting) an already-open one', async () => {
    mountTabs();
    await click('openTab a');
    expect(tabIds()).toHaveLength(1);
    await click('Push extra for a');
    expect(screen.getByText('Item a extra')).toBeTruthy();

    await click('openTab b');
    expect(tabIds()).toHaveLength(2); // A brand-new tab, A's is preserved alongside it.
    expect(screen.getByText('Item b details')).toBeTruthy();

    // Re-activating A (via activateTab) shows its preserved page, not a reset to the initial one.
    const [idA] = tabIds();
    await click(`activate ${idA}`);
    expect(screen.getByText('Item a extra')).toBeTruthy();
    expect(screen.queryByText('Item a details')).toBeNull();

    // Re-opening A via openTab again (same derived id) also activates-unchanged, not resetting it.
    await click('openTab b'); // switch away first
    await click('openTab a');
    expect(tabIds()).toHaveLength(2); // Still exactly two tabs, no duplicate.
    expect(screen.getByText('Item a extra')).toBeTruthy();
  });

  it("a stack's tabLabel names each open instance; a stack without one falls back to its page title unchanged", async () => {
    mountTabs();

    // Two openTab() instances of the SAME stack/definition must be told apart by name, not just by
    // which one happens to be active (the nevo-ui-level root cause behind "generic category label
    // instead of the opened entity's own name" — the tab strip/switcher already render whatever
    // `tab.title` they are given; the gap was that every instance's title was pinned to the same
    // static per-screen string with no way to vary by which entity opened it).
    await click('openTab a');
    await click('openTab b');
    expect(tabTitles()).toEqual(['Item a', 'Item b']);
    expect(tabTitles()).not.toContain('Item details'); // the static per-screen title, unused here

    // Pushing a dependent page within one tab's own local stack still only affects that tab's
    // entry — tabLabel is keyed off the stack's rootParams, not the active page, so it is stable
    // across a push/pop that does not change which entity the tab represents.
    const [idA] = tabIds();
    await click(`activate ${idA}`);
    await click('Push extra for a');
    expect(tabTitles()).toEqual(['Item a', 'Item b']);

    // A stack with no tabLabel (pageStack) is unaffected: it keeps resolving from the active
    // page's own static title exactly as before this field existed.
    await click('open one');
    expect(tabTitles()).toEqual(['Item a', 'Item b', 'One']);
  });

  it('with no pinned tab, closing the only tab empties the collection (no tab is synthesized)', async () => {
    mountTabs();
    await click('openTab a');
    expect(tabIds()).toHaveLength(1);
    const [id] = tabIds();
    await click(`closeTab ${id}`);
    expect(tabIds()).toHaveLength(0);
    expect(activeTab()).toBe('');
  });

  it('the pinned tab is present with closable:false and survives a closeTab attempt on it', async () => {
    mountTabs({ pinned: true });
    expect(tabIds()).toHaveLength(1); // Pinned alone, nothing else open.
    expect(screen.getByTestId('tab-closable').textContent).toBe('false');
    const [pinnedId] = tabIds();

    await click(`closeTab ${pinnedId}`);
    expect(tabIds()).toContain(pinnedId); // Refused: nothing to guard, nothing removed.

    await click('openTab a');
    expect(tabIds()).toHaveLength(2);
    const [, idA] = tabIds();
    await click(`closeTab ${idA}`);
    expect(tabIds()).toEqual([pinnedId]); // Closing the last opened tab falls back to pinned.
    expect(activeTab()).toBe(pinnedId);
  });

  it('with a pinned tab AND a remaining runtime neighbour, closeTab activates the neighbour, not the pinned tab', async () => {
    mountTabs({ pinned: true });
    await click('openTab a');
    await click('openTab b');
    const [pinnedId, idA, idB] = tabIds();
    expect(activeTab()).toBe(idB);

    // B has no right neighbour, so the rule falls back to its left neighbour (A) — the pinned tab
    // is NOT a shortcut taken merely because one exists; it is only the last-resort fallback.
    await click(`closeTab ${idB}`);
    expect(tabIds()).toEqual([pinnedId, idA]);
    expect(activeTab()).toBe(idA);

    // Re-open a right neighbour and close the (now) middle tab: its right neighbour wins over
    // both its left neighbour and the pinned tab.
    await click('openTab b');
    const [, , idB2] = tabIds();
    await click(`activate ${idA}`);
    await click(`closeTab ${idA}`);
    expect(tabIds()).toEqual([pinnedId, idB2]);
    expect(activeTab()).toBe(idB2); // Right neighbour of A, not the pinned tab.
  });

  it('closeTab activates the right neighbour, else the left one (useOpenedItems rule)', async () => {
    mountTabs();
    await click('openTab a');
    await click('openTab b');
    await click('openTab c');
    const [idA, idB, idC] = tabIds();
    expect(activeTab()).toBe(idC);

    await click(`activate ${idB}`);
    expect(activeTab()).toBe(idB);
    await click(`closeTab ${idB}`);
    expect(tabIds()).toEqual([idA, idC]);
    expect(activeTab()).toBe(idC); // Right neighbour of B.

    await click(`closeTab ${idC}`);
    expect(tabIds()).toEqual([idA]);
    expect(activeTab()).toBe(idA); // No right neighbour left: falls back to the left one.
  });

  it('closing the Secondary region hides it without discarding tabs; reopening restores the full set and the active tab', async () => {
    mountTabs();
    await click('openTab a');
    await click('openTab b');
    const [idA, idB] = tabIds();
    expect(activeTab()).toBe(idB);
    expect(isOpen()).toBe(true);

    await click('close region');
    expect(isOpen()).toBe(false);
    expect(tabIds()).toEqual([idA, idB]); // Not discarded.
    expect(activeTab()).toBe(idB); // Not reset either.

    // Reopening (activating the same tab that was active when closed) restores everything.
    await click(`activate ${idB}`);
    expect(isOpen()).toBe(true);
    expect(tabIds()).toEqual([idA, idB]);
    expect(activeTab()).toBe(idB);
  });

  it('closing the region when a pinned tab exists preserves every tab, pinned included', async () => {
    mountTabs({ pinned: true });
    await click('openTab a');
    const [pinnedId, idA] = tabIds();
    await click('close region');
    expect(isOpen()).toBe(false);
    expect(tabIds()).toEqual([pinnedId, idA]);
  });

  it('a scopeKey change discards everything immediately, including a pinned tab registration', async () => {
    const { rerender } = render(
      <AppWorkspaceProvider scopeKey="one">
        <AppShell navigation={<div>Nav</div>}>
          <TabsHost scope="one" />
        </AppShell>
      </AppWorkspaceProvider>,
    );
    mountCounts = {};
    capturedStacks = {};
    await click('openTab a');
    await click('openTab b');
    expect(tabIds()).toHaveLength(2);

    rerender(
      <AppWorkspaceProvider scopeKey="two">
        <AppShell navigation={<div>Nav</div>}>
          <TabsHost scope="two" />
        </AppShell>
      </AppWorkspaceProvider>,
    );
    expect(tabIds()).toHaveLength(0);
    expect(activeTab()).toBe('');
  });

  it('stale-callback isolation: a push on a now-inactive tab affects only that tab, not the active one', async () => {
    mountTabs();
    await click('openTab a');
    const navToA = capturedStacks.a!.navTo; // Captured while A was the active, mounted tab.

    await click('openTab b'); // B becomes active; A is preserved but no longer rendered.
    const [idA, idB] = tabIds();
    expect(activeTab()).toBe(idB);

    // A stale callback from A's (now unmounted) screen must only affect A's own flow.
    let pushResult = false;
    await act(async () => {
      pushResult = await navToA('extra');
    });
    expect(pushResult).toBe(true);
    expect(activeTab()).toBe(idB); // B is untouched: still active.
    expect(tabIds()).toEqual([idA, idB]); // Nothing was closed or reordered.
    expect(screen.queryByText('Item a extra')).toBeNull(); // Nothing visibly changed either.

    await click(`activate ${idA}`);
    expect(screen.getByText('Item a extra')).toBeTruthy(); // A's own push was applied, just not shown.
  });

  it("stale-callback isolation: closing a now-inactive tab's own flow discards only that tab", async () => {
    mountTabs();
    await click('openTab a');
    const closeA = capturedStacks.a!.close; // Captured while A was the active, mounted tab.

    await click('openTab b'); // B becomes active; A is preserved but no longer rendered.
    const [, idB] = tabIds();
    expect(activeTab()).toBe(idB);

    // A's own at-root close must discard only A; it must not hide the region B is showing.
    let closeResult = false;
    await act(async () => {
      closeResult = await closeA();
    });
    expect(closeResult).toBe(true);
    expect(isOpen()).toBe(true); // The region (showing B) was not hidden.
    expect(activeTab()).toBe(idB); // B is still active and untouched.
    expect(tabIds()).toEqual([idB]); // Only A was removed.
  });
});
