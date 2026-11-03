// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useSecondaryLeaveGuard,
  useSecondaryStack,
  useWorkspace,
  type WorkspaceContextValue,
} from './WorkspaceContext';
import { WORKSPACE_HISTORY_STATE_KEY } from './workspaceBrowserHistory';

interface Pages {
  root: Record<never, never>;
  detail: { id: string };
  leaf: Record<never, never>;
}

const guard = { allow: true };

function Root() {
  const stack = useSecondaryStack<Pages>();

  return (
    <>
      <p>Root page</p>
      <button type="button" onClick={() => void stack.navTo('detail', { id: 'a' })}>
        Push detail
      </button>
      <button type="button" onClick={() => void stack.replace('leaf')}>
        Replace with leaf
      </button>
    </>
  );
}

function Detail() {
  const stack = useSecondaryStack<Pages>();

  return (
    <>
      <p>Detail page</p>
      <button type="button" onClick={() => void stack.navTo('leaf')}>
        Push leaf
      </button>
    </>
  );
}

function Leaf() {
  useSecondaryLeaveGuard(() => guard.allow);

  return <p>Leaf page</p>;
}

const workStack = defineSecondaryStack<{ id: string }, { ready: true }, Pages>({
  id: 'work',
  initial: 'root',
  instanceId: ({ id }) => id,
  useData: () => ({ status: 'ready', data: { ready: true } }),
  screens: {
    root: { title: 'Work', component: Root },
    detail: { title: 'Detail', component: Detail },
    leaf: { title: 'Leaf', component: Leaf },
  },
});

let workspace: WorkspaceContextValue | null = null;
function Host() {
  const current = useWorkspace();
  workspace = current;

  return (
    <>
      <output data-testid="depth">{current.secondaryDepth}</output>
      <output data-testid="action">{current.transition.action}</output>
      {current.secondary
        ? (current.secondary.surface.wrap?.(current.secondary.surface.content) ??
          current.secondary.surface.content)
        : null}
    </>
  );
}

function mount(browserHistory = true) {
  return render(
    <AppWorkspaceProvider browserHistory={browserHistory}>
      <Host />
    </AppWorkspaceProvider>,
  );
}

const marker = (): { owner: string; depth: number } | undefined =>
  (window.history.state as Record<string, never> | null)?.[WORKSPACE_HISTORY_STATE_KEY];
const markerDepth = () => marker()?.depth ?? 0;
const depth = () => Number(screen.getByTestId('depth').textContent);

async function call(operation: (value: WorkspaceContextValue) => Promise<boolean>) {
  await act(async () => {
    await operation(workspace!);
  });
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

async function openWork(id = 'a') {
  await call((value) => value.openTab(workStack, { id }));
  await screen.findByText('Root page');
}

/** Performs a browser traversal and waits for its `popstate` (jsdom traverses asynchronously). */
async function browser(step: () => void) {
  await act(async () => {
    const popped = new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true });
    });
    step();
    await popped;
  });
}

/** Lets every in-flight traversal settle so the next test starts from a quiet history. */
async function settleHistory() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

// jsdom keeps one session history per file: start every test on a fresh, marker-free entry with
// no forward entries, so `history.length` deltas are exact.
beforeEach(() => {
  window.history.pushState(null, '');
});

afterEach(async () => {
  await settleHistory();
  cleanup();
  workspace = null;
  guard.allow = true;
  vi.restoreAllMocks();
});

describe('AppWorkspaceProvider browserHistory', () => {
  it('adds one same-URL entry per step a workspace Back would undo', async () => {
    mount();
    const href = window.location.href;
    const length = window.history.length;

    await openWork();
    expect(window.history.length).toBe(length + 1);
    expect(markerDepth()).toBe(1);

    await click('Push detail');
    await screen.findByText('Detail page');
    expect(window.history.length).toBe(length + 2);
    expect(markerDepth()).toBe(2);
    expect(window.location.href).toBe(href);
  });

  it('browser Back pops the sub-page, then hides the Secondary at the tab root', async () => {
    mount();
    await openWork();
    await click('Push detail');
    await screen.findByText('Detail page');

    await browser(() => window.history.back());
    await screen.findByText('Root page');
    expect(depth()).toBe(1);
    expect(screen.getByTestId('action').textContent).toBe('pop');
    expect(markerDepth()).toBe(1);

    await browser(() => window.history.back());
    await waitFor(() => expect(depth()).toBe(0));
    expect(screen.getByTestId('action').textContent).toBe('close');
    expect(screen.queryByText('Root page')).toBeNull();
    expect(marker()).toBeUndefined();
  });

  it('UI Back and Close consume their entries instead of leaving stale ones', async () => {
    mount();
    await openWork();
    const lengthAtRoot = window.history.length;
    await click('Push detail');
    await screen.findByText('Detail page');

    await call((value) => value.back());
    await waitFor(() => expect(markerDepth()).toBe(1));
    expect(depth()).toBe(1);

    // Re-pushing overwrites the consumed (forward) entry: nothing accumulates.
    await click('Push detail');
    await screen.findByText('Detail page');
    expect(window.history.length).toBe(lengthAtRoot + 1);
    expect(markerDepth()).toBe(2);

    await call((value) => value.close());
    await waitFor(() => expect(marker()).toBeUndefined());
    expect(depth()).toBe(0);
  });

  it('a multi-entry browser traversal performs one workspace Back per entry', async () => {
    mount();
    await openWork();
    await click('Push detail');
    await click('Push leaf');
    await screen.findByText('Leaf page');

    await browser(() => window.history.go(-2));
    await screen.findByText('Root page');
    await settleHistory();
    expect(depth()).toBe(1);
    expect(markerDepth()).toBe(1);
  });

  it('a breadcrumb jump of N levels consumes exactly N entries', async () => {
    mount();
    await openWork();
    const lengthAtRoot = window.history.length;
    await click('Push detail');
    await click('Push leaf');
    await screen.findByText('Leaf page');
    expect(markerDepth()).toBe(3);

    const go = vi.spyOn(window.history, 'go');
    await call((value) => value.backTo(1));
    await waitFor(() => expect(markerDepth()).toBe(1));
    await settleHistory();
    // One traversal for the whole jump, not one per level.
    expect(go.mock.calls).toEqual([[-2]]);
    go.mockRestore();
    expect(depth()).toBe(1);
    expect(screen.getByTestId('action').textContent).toBe('pop');
    expect(markerDepth()).toBe(1);

    // The consumed entries are forward entries now: pushing again overwrites, nothing accumulates,
    // and browser Back still steps one level at a time.
    await click('Push detail');
    await screen.findByText('Detail page');
    expect(window.history.length).toBe(lengthAtRoot + 1);
    expect(markerDepth()).toBe(2);

    await browser(() => window.history.back());
    await screen.findByText('Root page');
    expect(depth()).toBe(1);
    expect(markerDepth()).toBe(1);
  });

  it('skips orphaned entries left by an earlier provider instance', async () => {
    const first = mount();
    await openWork();
    await click('Push detail');
    await screen.findByText('Detail page');
    first.unmount();

    mount();
    await browser(() => window.history.back()); // onto the orphan at depth 1 ...
    await waitFor(() => expect(marker()).toBeUndefined()); // ... skipped to the base entry
    expect(depth()).toBe(0);
  });

  it('replace and opening another tab while open add no entry', async () => {
    mount();
    await openWork('a');
    const length = window.history.length;

    await click('Replace with leaf');
    await screen.findByText('Leaf page');
    expect(window.history.length).toBe(length);
    expect(markerDepth()).toBe(1);

    // A second root tab is still one Back away from hidden, like the first.
    await openWork('b');
    expect(window.history.length).toBe(length);
    expect(markerDepth()).toBe(1);
  });

  it('a refusing leave guard keeps the page and restores the popped entry', async () => {
    mount();
    await openWork();
    await click('Push detail');
    await click('Push leaf');
    await screen.findByText('Leaf page');
    expect(markerDepth()).toBe(3);

    guard.allow = false;
    const length = window.history.length;
    await browser(() => window.history.back());
    await waitFor(() => expect(markerDepth()).toBe(3));
    expect(window.history.length).toBe(length);
    expect(screen.getByText('Leaf page')).toBeTruthy();
    expect(depth()).toBe(3);
  });

  it('neutralises browser Forward onto an already consumed entry', async () => {
    mount();
    await openWork();
    await click('Push detail');
    await screen.findByText('Detail page');

    await browser(() => window.history.back());
    await screen.findByText('Root page');

    await browser(() => window.history.forward());
    await waitFor(() => expect(markerDepth()).toBe(1));
    await settleHistory();
    expect(depth()).toBe(1);
    expect(markerDepth()).toBe(1);
  });

  it("keeps a router's own history.state keys and bypasses its patched pushState", async () => {
    window.history.replaceState({ __TSR_index: 7, __TSR_key: 'k1', key: 'k1' }, '');
    const patched = vi.spyOn(window.history, 'pushState');
    mount();
    await openWork();

    expect(patched).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ __TSR_index: 7, __TSR_key: 'k1', key: 'k1' });
    expect(markerDepth()).toBe(1);

    await browser(() => window.history.back());
    await waitFor(() => expect(depth()).toBe(0));
    expect(window.history.state).toEqual({ __TSR_index: 7, __TSR_key: 'k1', key: 'k1' });
  });

  it('does nothing unless opted in', async () => {
    mount(false);
    const length = window.history.length;
    const state: unknown = window.history.state;

    await openWork();
    await click('Push detail');
    await screen.findByText('Detail page');

    expect(window.history.length).toBe(length);
    expect(window.history.state).toBe(state);
  });

  it('lets only the first enabled provider own browser history', async () => {
    const length = window.history.length;
    render(
      <>
        <AppWorkspaceProvider browserHistory>
          <Host />
        </AppWorkspaceProvider>
        <AppWorkspaceProvider browserHistory>
          <p>Second provider</p>
        </AppWorkspaceProvider>
      </>,
    );
    await openWork();

    expect(window.history.length).toBe(length + 1);
  });

  it('stops listening on unmount and frees ownership for the next provider', async () => {
    const view = mount();
    await openWork();
    const owner = marker()?.owner;
    const length = window.history.length;
    const removed = vi.spyOn(window, 'removeEventListener');
    view.unmount();

    expect(removed).toHaveBeenCalledWith('popstate', expect.any(Function));
    // Unmounting never traverses: its entries may already sit below a router navigation.
    await settleHistory();
    expect(window.history.length).toBe(length);
    expect(marker()?.owner).toBe(owner);

    mount();
    await openWork();
    expect(marker()?.owner).toBeDefined();
    expect(marker()?.owner).not.toBe(owner);
  });
});
