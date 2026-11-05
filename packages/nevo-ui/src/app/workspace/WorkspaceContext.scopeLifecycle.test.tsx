// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineSecondaryStack } from './SecondaryStack';
import { useSecondaryScrollMemory } from './secondaryScrollMemory';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryLeaveGuard,
  useWorkspace,
  type WorkspaceContextValue,
} from './WorkspaceContext';

// A `scopeKey` change on a provider that stays mounted (secondary-navigation.md, `scopeKey`):
// everything the old scope owned — its tabs, the pinned tab's selection, leave guards, queued
// navigation, scroll memory — is invalidated, and the new scope is usable at once. Every test here
// re-renders the SAME provider with a new `scopeKey`; nothing remounts.

const PINNED_ID = '$workspace-pinned$';

const guardState: { result: boolean | Promise<boolean> } = { result: true };
const workGuard = () => guardState.result;

interface Pages {
  page: Record<never, never>;
}

function WorkScreen({ data }: { data: string }) {
  useSecondaryLeaveGuard(workGuard);

  return <p>Work {data}</p>;
}

const workStack = defineSecondaryStack<{ id: string }, string, Pages>({
  id: 'work',
  initial: 'page',
  instanceId: (p) => p.id,
  tabLabel: (p) => `Work ${p.id}`,
  useData: (p) => ({ status: 'ready', data: p.id }),
  screens: { page: { title: 'Work', component: WorkScreen } },
});

function PinnedContext({ title }: { title: string | null }) {
  useRegisterPinnedSecondaryTab(title === null ? null : { title });

  return null;
}

function ScrollPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useSecondaryScrollMemory(ref, 'context-panel');

  return (
    <div ref={ref}>
      <div data-testid="scroller" style={{ overflowY: 'auto' }} />
    </div>
  );
}

let workspace: WorkspaceContextValue | null = null;

function Host({ pinned, panel }: { pinned: string | null; panel: boolean }) {
  const current = useWorkspace();
  workspace = current;

  return (
    <>
      <PinnedContext title={pinned} />
      {current.secondary
        ? (current.secondary.surface.wrap?.(current.secondary.surface.content) ??
          current.secondary.surface.content)
        : null}
      {panel ? <ScrollPanel /> : null}
    </>
  );
}

const tree = (
  scopeKey: string,
  {
    pinned = 'Context',
    panel = false,
    history = false,
  }: { pinned?: string | null; panel?: boolean; history?: boolean } = {},
) => (
  <AppWorkspaceProvider scopeKey={scopeKey} browserHistory={history}>
    <Host pinned={pinned} panel={panel} />
  </AppWorkspaceProvider>
);

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });

async function call<T>(operation: (value: WorkspaceContextValue) => Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => {
    result = await operation(workspace!);
  });

  return result;
}

const tabIds = () => workspace!.tabs.tabs.map((tab) => tab.id);
const activeTabId = () => workspace!.tabs.activeTabId;

beforeEach(() => {
  guardState.result = true;
});
afterEach(() => {
  cleanup();
  workspace = null;
  vi.restoreAllMocks();
});

describe('scopeKey change in place: the new scope starts clean and works', () => {
  it('Context only: the pinned tab stays the active tab of the new scope', async () => {
    const { rerender } = render(tree('A'));
    await flush();
    expect(activeTabId()).toBe(PINNED_ID);

    rerender(tree('B'));
    await flush();

    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
    expect(await call((value) => value.activateTab(PINNED_ID))).toBe(true);
  });

  it('Work active: Work is dropped and Context is active and operable in the new scope', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));
    expect(screen.getByText('Work a')).toBeTruthy();

    rerender(tree('B'));
    await flush();

    expect(screen.queryByText('Work a')).toBeNull();
    expect(workspace!.secondary).toBeNull();
    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
    // The provider's own record of the scope is the new one, not a leftover of A.
    expect(await call((value) => value.activateTab(PINNED_ID))).toBe(true);
  });

  it('Work open but Context selected: Work is dropped and Context stays selected', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));
    await call((value) => value.activateTab(PINNED_ID));
    expect(tabIds()).toEqual([PINNED_ID, 'work:a']);

    rerender(tree('B'));
    await flush();

    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
    expect(await call((value) => value.activateTab('work:a'))).toBe(false);
    expect(await call((value) => value.activateTab(PINNED_ID))).toBe(true);
  });

  it('rapid A → B → A: the first A visit does not come back', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    rerender(tree('B'));
    rerender(tree('A'));
    await flush();

    expect(screen.queryByText('Work a')).toBeNull();
    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
    expect(await call((value) => value.activateTab(PINNED_ID))).toBe(true);
  });

  it('opening Work right after the switch works, and closing it returns to Context', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    rerender(tree('B'));
    expect(await call((value) => value.openTab(workStack, { id: 'b' }))).toBe(true);

    expect(screen.getByText('Work b')).toBeTruthy();
    expect(tabIds()).toEqual([PINNED_ID, 'work:b']);
    expect(activeTabId()).toBe('work:b');

    expect(await call((value) => value.closeTab('work:b'))).toBe(true);
    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
  });
});

describe('scopeKey change in place: hiding and restoring the side panel', () => {
  it('Context only: unregistering the pinned tab hides the region, registering it again restores it', async () => {
    const { rerender } = render(tree('A'));
    await flush();

    rerender(tree('B'));
    await flush();
    rerender(tree('B', { pinned: null }));
    await flush();
    expect(tabIds()).toEqual([]);
    expect(activeTabId()).toBeNull();

    rerender(tree('B'));
    await flush();
    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
  });

  it('after Work was dropped: close() hides Context behind a new Work tab and activateTab restores it', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    rerender(tree('B'));
    await flush();
    // The pinned tab of B goes away and comes back (the host re-registers it).
    rerender(tree('B', { pinned: null }));
    await flush();
    expect(activeTabId()).toBeNull();
    rerender(tree('B'));
    await flush();
    expect(activeTabId()).toBe(PINNED_ID);

    await call((value) => value.openTab(workStack, { id: 'b' }));
    await call((value) => value.activateTab(PINNED_ID));
    expect(await call((value) => value.close())).toBe(true);
    expect(workspace!.secondary).toBeNull();
    expect(await call((value) => value.activateTab('work:b'))).toBe(true);
    expect(screen.getByText('Work b')).toBeTruthy();
  });
});

describe('scopeKey change in place: operations queued by the old scope', () => {
  it('a guard still pending in A neither blocks B nor lets its operation mutate B', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    let resolveGuard!: (allowed: boolean) => void;
    guardState.result = new Promise<boolean>((resolve) => {
      resolveGuard = resolve;
    });
    // Leaving Work a asks its guard, which is still pending when the scope changes.
    const fromA = workspace!.openTab(workStack, { id: 'queued' });
    await flush();

    guardState.result = true;
    rerender(tree('B'));
    await flush();

    // B is usable immediately: its own operation does not wait behind A's pending guard.
    let openedInB: boolean | undefined;
    void workspace!.openTab(workStack, { id: 'b' }).then((opened) => {
      openedInB = opened;
    });
    await flush();
    expect(openedInB).toBe(true);
    expect(tabIds()).toEqual([PINNED_ID, 'work:b']);

    await act(async () => {
      resolveGuard(true);
      expect(await fromA).toBe(false);
    });
    await flush();
    expect(tabIds()).toEqual([PINNED_ID, 'work:b']);
    expect(activeTabId()).toBe('work:b');
  });

  it('A → B → A: an operation queued by the first A visit does not mutate the second', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    let resolveGuard!: (allowed: boolean) => void;
    guardState.result = new Promise<boolean>((resolve) => {
      resolveGuard = resolve;
    });
    const fromFirstA = workspace!.openTab(workStack, { id: 'queued' });
    await flush();

    guardState.result = true;
    rerender(tree('B'));
    await flush();
    rerender(tree('A'));
    await flush();

    await act(async () => {
      resolveGuard(true);
      expect(await fromFirstA).toBe(false);
    });
    await flush();
    expect(tabIds()).toEqual([PINNED_ID]);
    expect(activeTabId()).toBe(PINNED_ID);
  });
});

// The old scope's guard may never answer (its dialog went away with the old screen): every
// operation of that scope settles `false` when the scope changes, without waiting for it.
describe('scopeKey change in place: an old-scope guard that does not answer', () => {
  const settled = <T,>(promise: Promise<T>) => {
    const state: { done: boolean; value?: T } = { done: false };
    void promise.then((value) => {
      state.done = true;
      state.value = value;
    });

    return state;
  };

  /** A guard that answers only when the test says so — or never. */
  const holdGuard = () => {
    let answer!: (allowed: boolean) => void;
    guardState.result = new Promise<boolean>((resolve) => {
      answer = resolve;
    });

    return (allowed: boolean) => answer(allowed);
  };

  it.each([
    ['openTab', (value: WorkspaceContextValue) => value.openTab(workStack, { id: 'queued' })],
    ['open', (value: WorkspaceContextValue) => value.open(workStack, { id: 'queued' })],
    ['closeTab', (value: WorkspaceContextValue) => value.closeTab('work:a')],
    ['back', (value: WorkspaceContextValue) => value.back()],
    ['close', (value: WorkspaceContextValue) => value.close()],
    ['activateTab', (value: WorkspaceContextValue) => value.activateTab(PINNED_ID)],
    ['canLeaveScope', (value: WorkspaceContextValue) => value.canLeaveScope()],
  ])(
    '%s waiting on a guard that never answers resolves false on the scope change',
    async (_, run) => {
      const { rerender } = render(tree('A'));
      await call((value) => value.openTab(workStack, { id: 'a' }));

      holdGuard();
      const fromA = settled(run(workspace!));
      // A second A operation queued behind the waiting one settles too.
      const queuedBehind = settled(workspace!.activateTab(PINNED_ID));
      await flush();
      expect(fromA.done).toBe(false);

      guardState.result = true;
      rerender(tree('B'));
      await flush();

      expect(fromA).toEqual({ done: true, value: false });
      expect(queuedBehind).toEqual({ done: true, value: false });
      expect(tabIds()).toEqual([PINNED_ID]);
      expect(activeTabId()).toBe(PINNED_ID);
      expect(await call((value) => value.openTab(workStack, { id: 'b' }))).toBe(true);
      expect(tabIds()).toEqual([PINNED_ID, 'work:b']);
    },
  );

  it('a late "true" from the old guard, after the switch, does not mutate the new scope', async () => {
    const { rerender } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    const answer = holdGuard();
    const fromA = settled(workspace!.openTab(workStack, { id: 'queued' }));
    const backFromA = settled(workspace!.back());
    await flush();

    guardState.result = true;
    rerender(tree('B'));
    await flush();
    expect(fromA).toEqual({ done: true, value: false });
    expect(backFromA).toEqual({ done: true, value: false });

    await call((value) => value.openTab(workStack, { id: 'b' }));
    await act(async () => {
      answer(true);
    });
    await flush();

    expect(fromA.value).toBe(false);
    expect(tabIds()).toEqual([PINNED_ID, 'work:b']);
    expect(activeTabId()).toBe('work:b');
    expect(screen.getByText('Work b')).toBeTruthy();
    expect(screen.queryByText('Work queued')).toBeNull();
  });

  it('an operation waiting on a guard that never answers resolves false when the provider unmounts', async () => {
    const { unmount } = render(tree('A'));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    holdGuard();
    const fromA = settled(workspace!.closeTab('work:a'));
    await flush();
    expect(fromA.done).toBe(false);

    unmount();
    await flush();

    expect(fromA).toEqual({ done: true, value: false });
  });

  it('a browser Back waiting on the old guard does not swallow browser Back in the new scope', async () => {
    const browserBack = () =>
      act(async () => {
        const popped = new Promise((resolve) => {
          window.addEventListener('popstate', resolve, { once: true });
        });
        window.history.back();
        await popped;
      });
    // A fresh, marker-free entry (jsdom keeps one session history per file).
    window.history.pushState(null, '');
    const { rerender } = render(tree('A', { history: true }));
    await call((value) => value.openTab(workStack, { id: 'a' }));

    holdGuard();
    // Browser Back asks Work a's guard, which never answers.
    await browserBack();
    await flush();
    expect(screen.getByText('Work a')).toBeTruthy();

    guardState.result = true;
    rerender(tree('B', { history: true }));
    await flush();
    await call((value) => value.openTab(workStack, { id: 'b' }));
    expect(screen.getByText('Work b')).toBeTruthy();

    await browserBack();
    await flush();
    expect(screen.queryByText('Work b')).toBeNull();
    expect(workspace!.secondary).toBeNull();
  });

  it('a focus return the old scope scheduled does not move focus in the new scope', async () => {
    // Elements count as rendered (jsdom has no layout), and frames run when the test says so.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList,
    );
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);

      return frames.length;
    });
    const opener = document.body.appendChild(document.createElement('button'));
    const elsewhere = document.body.appendChild(document.createElement('button'));
    try {
      const { rerender } = render(tree('A', { pinned: null }));
      opener.focus();
      await call((value) => value.openTab(workStack, { id: 'a' }));
      // Closing the only tab returns focus to its opener on the next frame...
      expect(await call((value) => value.closeTab('work:a'))).toBe(true);
      expect(frames.length).toBeGreaterThan(0);

      // ...but the scope changes first, and the reader moves on inside the new scope.
      rerender(tree('B', { pinned: null }));
      await flush();
      elsewhere.focus();
      act(() => {
        while (frames.length > 0) {
          frames.shift()!(0);
        }
      });

      expect(document.activeElement).toBe(elsewhere);
    } finally {
      opener.remove();
      elsewhere.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe('scopeKey change in place: scroll memory', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100);
  });

  it("a panel shown again in the new scope does not get the old scope's offset", async () => {
    const { rerender } = render(tree('A', { panel: true }));
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    fireEvent.scroll(scroller);
    // The panel leaves (e.g. Work is shown instead) and A's memory keeps its offset.
    rerender(tree('A', { panel: false }));
    await flush();

    // The scope changes in the same commit that shows the panel again.
    rerender(tree('B', { panel: true }));
    await flush();

    expect(screen.getByTestId('scroller').scrollTop).toBe(0);
  });

  it('a panel that stays mounted across the change does not restore old offsets later', async () => {
    const { rerender } = render(tree('A', { panel: true }));
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    fireEvent.scroll(scroller);

    rerender(tree('B', { panel: true }));
    await flush();
    rerender(tree('B', { panel: false }));
    await flush();
    rerender(tree('B', { panel: true }));
    await flush();

    expect(screen.getByTestId('scroller').scrollTop).toBe(0);
  });
});
