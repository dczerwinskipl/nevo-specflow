// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

let workspaceWidth = 1400;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  // The width AppShell and the tab strip measure: split-capable (1400) or stacked (500).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: workspaceWidth,
    height: 56,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  }));
  // jsdom has no layout: every element holds 1000px of content in a 100px viewport.
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100);
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.scrollTo ??= () => undefined;
  window.scrollTo = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  workspaceWidth = 1400;
});

interface Pages {
  list: Record<never, never>;
  detail: Record<never, never>;
}

function listStack(id: string, label: string) {
  return defineSecondaryStack<Record<never, never>, string, Pages>({
    id,
    initial: 'list',
    useData: () => ({ status: 'ready', data: label }),
    screens: {
      list: {
        title: label,
        component: ({ data }) => {
          const stack = useSecondaryStack<Pages>();

          return (
            <div data-testid={`scroller-${data}`} style={{ overflowY: 'auto' }}>
              <p>{`${data} list`}</p>
              <button type="button" onClick={() => void stack.navTo('detail')}>
                {`Open ${data} detail`}
              </button>
            </div>
          );
        },
      },
      detail: { title: `${label} detail`, component: () => <p>{`${label} detail`}</p> },
    },
  });
}

const stackA = listStack('root-tabs-a', 'Alpha');
const stackB = listStack('root-tabs-b', 'Beta');

function Host() {
  const navigation = useSecondaryNavigation();
  useRegisterPinnedSecondaryTab({ title: 'Context' });

  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        <button type="button" onClick={() => void navigation.openTab(stackA, {})}>
          openTab Alpha
        </button>
        <button type="button" onClick={() => void navigation.openTab(stackB, {})}>
          openTab Beta
        </button>
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
        <div data-testid="scroller-Context" style={{ overflowY: 'auto' }}>
          Context content
        </div>
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

function mount() {
  return render(
    <AppWorkspaceProvider>
      <AppShell navigation={<div>Nav</div>}>
        <Host />
      </AppShell>
    </AppWorkspaceProvider>,
  );
}

const click = async (name: string | RegExp, options: { hidden?: boolean } = {}) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name, ...options }));
    await Promise.resolve();
  });
};

const clickTab = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name }));
    await Promise.resolve();
  });
};

const scrollTo = (testId: string, top: number) => {
  const element = screen.getByTestId(testId);
  element.scrollTop = top;
  fireEvent.scroll(element);
};

describe('Secondary root tabs on a split layout: scroll is remembered per tab and entry', () => {
  it('restores a tab scroll after switching away and back, for the pinned tab and a runtime tab', async () => {
    mount();
    scrollTo('scroller-Context', 200);

    await click('openTab Alpha');
    expect(screen.queryByTestId('scroller-Context')).toBeNull(); // Inactive tabs unmount.
    scrollTo('scroller-Alpha', 120);

    await clickTab('Context');
    expect(screen.getByTestId('scroller-Context').scrollTop).toBe(200);

    await clickTab('Alpha');
    expect(screen.getByTestId('scroller-Alpha').scrollTop).toBe(120);
  });

  it('keys the offset by stack entry: the pushed detail starts at the top and Back restores the list', async () => {
    mount();
    await click('openTab Alpha');
    scrollTo('scroller-Alpha', 300);

    await click('Open Alpha detail');
    expect(screen.queryByTestId('scroller-Alpha')).toBeNull();

    await click(/: Alpha$/);
    expect(screen.getByTestId('scroller-Alpha').scrollTop).toBe(300);
  });

  it('forgets a closed tab: reopening it starts at the top', async () => {
    mount();
    await click('openTab Alpha');
    scrollTo('scroller-Alpha', 150);

    await click('Close Alpha');
    await click('openTab Alpha');
    expect(screen.getByTestId('scroller-Alpha').scrollTop).toBe(0);
  });
});

describe('Secondary root tabs on a stacked layout: the shown tab is a tabpanel', () => {
  it('labels the content wrapper by the active tab, so aria-controls points at a real element', async () => {
    workspaceWidth = 500;
    mount();
    await click('openTab Alpha', { hidden: true });
    await click('openTab Beta', { hidden: true });

    expect(document.querySelector('[data-layout="stacked"]')).not.toBeNull();
    const selected = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const controls = selected?.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const panel = document.getElementById(controls!);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected?.id);
    expect(panel?.closest('[data-workspace-surface="secondary"]')).not.toBeNull();
  });
});
