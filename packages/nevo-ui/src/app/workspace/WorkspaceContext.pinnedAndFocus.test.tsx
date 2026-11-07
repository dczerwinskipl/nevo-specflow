// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspace,
} from './WorkspaceContext';

interface Pages {
  page: Record<never, never>;
}
const objectStack = defineSecondaryStack<{ objectId: string }, string, Pages>({
  id: 'object',
  initial: 'page',
  instanceId: (p) => p.objectId,
  tabLabel: (p) => `Object ${p.objectId}`,
  useData: (p) => ({ status: 'ready', data: p.objectId }),
  screens: { page: { title: 'Object', component: ({ data }) => <p>Content {data}</p> } },
});

const PINNED_ID = '$workspace-pinned$';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve();
    }
  });

beforeEach(() => {
  // Elements count as rendered, and animation frames run on a macrotask, so focus restoration is
  // observable.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList,
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const settleFrames = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('F16 closing a tab restores focus to its opener only when nothing else takes it', () => {
  function Host({ closed }: { closed: string }) {
    const navigation = useSecondaryNavigation();

    return (
      <div>
        <button
          type="button"
          onClick={() => void navigation.openTab(objectStack, { objectId: 'a' })}
        >
          open a
        </button>
        <button
          type="button"
          onClick={() => void navigation.openTab(objectStack, { objectId: 'b' })}
        >
          open b
        </button>
        <input aria-label="elsewhere" />
        <button type="button" onClick={() => void navigation.closeTab(`object:${closed}`)}>
          close
        </button>
      </div>
    );
  }

  async function openFromOpeners() {
    const openA = screen.getByRole('button', { name: 'open a' });
    openA.focus();
    fireEvent.click(openA);
    await flush();
    const openB = screen.getByRole('button', { name: 'open b' });
    openB.focus();
    fireEvent.click(openB); // b is active, a waits in the background
    await flush();
  }

  async function closeWhileFocusIs(target: HTMLElement) {
    // Stands in for the neighbour tab that the tab strip focuses after a close.
    target.focus();
    fireEvent.click(screen.getByRole('button', { name: 'close' })); // a click does not move focus
    await flush();
    await settleFrames();
  }

  it('closing a background tab leaves focus where it is', async () => {
    render(
      <AppWorkspaceProvider>
        <Host closed="a" />
      </AppWorkspaceProvider>,
    );
    await openFromOpeners();
    const elsewhere = screen.getByLabelText('elsewhere');

    await closeWhileFocusIs(elsewhere);

    expect(document.activeElement).toBe(elsewhere);
  });

  it('closing the active tab while a neighbour remains leaves focus to the tab strip', async () => {
    render(
      <AppWorkspaceProvider>
        <Host closed="b" />
      </AppWorkspaceProvider>,
    );
    await openFromOpeners();
    const elsewhere = screen.getByLabelText('elsewhere');

    await closeWhileFocusIs(elsewhere);

    expect(document.activeElement).toBe(elsewhere);
  });

  it('closing the active tab with nothing left restores focus to the control that opened it', async () => {
    render(
      <AppWorkspaceProvider>
        <Host closed="a" />
      </AppWorkspaceProvider>,
    );
    const openA = screen.getByRole('button', { name: 'open a' });
    openA.focus();
    fireEvent.click(openA);
    await flush();

    await closeWhileFocusIs(screen.getByLabelText('elsewhere'));

    expect(document.activeElement).toBe(openA);
  });
});

describe('restoring focus to an opener the product remounted', () => {
  function Rows({ generation }: { generation: number }) {
    const navigation = useSecondaryNavigation();

    return (
      <ul key={generation}>
        {['a', 'b'].map((id) => (
          <li key={id} data-focus-key={`row:${id}`}>
            <button
              type="button"
              onClick={() => void navigation.open(objectStack, { objectId: id })}
            >
              Open
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => void navigation.close()}>
            close
          </button>
        </li>
      </ul>
    );
  }

  it('finds the same row again by its focus key, not the first control with the same text', async () => {
    const { rerender } = render(
      <AppWorkspaceProvider>
        <Rows generation={0} />
      </AppWorkspaceProvider>,
    );
    const opener = screen.getAllByRole('button', { name: 'Open' })[1]!;
    opener.focus();
    fireEvent.click(opener);
    await flush();

    // The rows remount while the Secondary is open (for example a layout change).
    rerender(
      <AppWorkspaceProvider>
        <Rows generation={1} />
      </AppWorkspaceProvider>,
    );
    expect(opener.isConnected).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await flush();
    await settleFrames();

    const remounted = screen.getAllByRole('button', { name: 'Open' })[1]!;
    expect(document.activeElement).toBe(remounted);
  });
});

describe('N2 hiding the region while the pinned tab is active', () => {
  function Host() {
    useRegisterPinnedSecondaryTab({ title: 'Context' });
    const workspace = useWorkspace();

    return (
      <div>
        <button
          type="button"
          onClick={() => void workspace.openTab(objectStack, { objectId: 'w' })}
        >
          open work
        </button>
        <button type="button" onClick={() => void workspace.activateTab(PINNED_ID)}>
          show context
        </button>
        <button type="button" onClick={() => void workspace.close()}>
          close region
        </button>
        <output data-testid="active">{workspace.tabs.activeTabId ?? ''}</output>
        <output data-testid="depth">{workspace.secondaryDepth}</output>
      </div>
    );
  }

  const click = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }));
    await flush();
  };

  const active = () => screen.getByTestId('active').textContent;
  const depth = () => screen.getByTestId('depth').textContent;

  it('close() keeps the pinned tab active and the background Work tab hidden', async () => {
    render(
      <AppWorkspaceProvider>
        <Host />
      </AppWorkspaceProvider>,
    );
    await flush();
    await click('open work');
    await click('show context');
    expect(active()).toBe(PINNED_ID);

    await click('close region');
    expect(active()).toBe(PINNED_ID);
    expect(depth()).toBe('0');

    // Reopening restores the tab that was active, and a runtime tab still opens on demand.
    await click('show context');
    expect(active()).toBe(PINNED_ID);
    expect(depth()).toBe('0');
    await click('open work');
    expect(active()).toBe('object:w');
    expect(depth()).toBe('1');
  });

  it('close() with the pinned tab alone changes nothing', async () => {
    render(
      <AppWorkspaceProvider>
        <Host />
      </AppWorkspaceProvider>,
    );
    await flush();
    await click('close region');
    expect(active()).toBe(PINNED_ID);
  });

  it('unregistering the pinned tab does not switch to, or reopen, a background tab', async () => {
    function Toggle() {
      const [contextOpen, setContextOpen] = useState(true);
      const hiddenTabId = useRef<string | null>(null);
      const workspace = useWorkspace();
      useRegisterPinnedSecondaryTab(contextOpen ? { title: 'Context' } : null);

      return (
        <div>
          <button
            type="button"
            onClick={() => void workspace.openTab(objectStack, { objectId: 'w' })}
          >
            open work
          </button>
          <button type="button" onClick={() => void workspace.activateTab(PINNED_ID)}>
            show context
          </button>
          <button
            type="button"
            onClick={() => {
              // The product side-panel toggle, as in the N2 repro of the review.
              if (contextOpen) {
                hiddenTabId.current = workspace.tabs.activeTabId;
                setContextOpen(false);
              } else {
                setContextOpen(true);
              }
            }}
          >
            toggle
          </button>
          <output data-testid="active">{workspace.tabs.activeTabId ?? ''}</output>
          <output data-testid="depth">{workspace.secondaryDepth}</output>
        </div>
      );
    }

    render(
      <AppWorkspaceProvider>
        <Toggle />
      </AppWorkspaceProvider>,
    );
    await flush();
    await click('open work');
    await click('show context');
    expect(active()).toBe(PINNED_ID);

    await click('toggle'); // hide the whole panel
    expect(depth()).toBe('0'); // the Work tab did not take over
    expect(active()).not.toBe('object:w');

    await click('toggle'); // show it again: the pinned tab, which was active, is back
    expect(active()).toBe(PINNED_ID);
    expect(depth()).toBe('0');
  });
});
