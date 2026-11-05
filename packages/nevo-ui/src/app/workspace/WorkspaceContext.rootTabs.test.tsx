// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import {
  SecondaryScrollMemoryContext,
  createSecondaryScrollMemory,
  secondaryScrollKey,
  useSecondaryScrollMemory,
} from './secondaryScrollMemory';
import {
  AppWorkspaceProvider,
  useSecondaryLeaveGuard,
  useSecondaryNavigation,
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

describe('root tabs: leaving the visible tab asks its leave guard', () => {
  interface Params {
    objectId: string;
  }
  interface Pages {
    page: Record<never, never>;
  }

  // One verdict per object, read at the moment the guard runs.
  const verdict: Record<string, boolean> = {};
  const asked: string[] = [];

  function GuardedScreen({ data: objectId }: { data: string }) {
    useSecondaryLeaveGuard(() => {
      asked.push(objectId);

      return verdict[objectId] ?? true;
    });

    return <p>Content {objectId}</p>;
  }

  const objectStack = defineSecondaryStack<Params, string, Pages>({
    id: 'object',
    initial: 'page',
    instanceId: (params) => params.objectId,
    tabLabel: (params) => `Object ${params.objectId}`,
    useData: (params) => ({ status: 'ready', data: params.objectId }),
    screens: { page: { title: 'Object', component: GuardedScreen } },
  });
  const plainStack = defineSecondaryStack<Record<never, never>, string, Pages>({
    id: 'plain',
    initial: 'page',
    useData: () => ({ status: 'ready', data: 'plain' }),
    screens: { page: { title: 'Plain', component: () => <p>Plain content</p> } },
  });

  function Host() {
    const navigation = useSecondaryNavigation();

    return (
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <div>
            {['a', 'b'].map((objectId) => (
              <button
                key={objectId}
                type="button"
                onClick={() => void navigation.openTab(objectStack, { objectId })}
              >
                {`tab ${objectId}`}
              </button>
            ))}
            <button type="button" onClick={() => void navigation.open(plainStack, {})}>
              open plain
            </button>
            {navigation.tabs.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => void navigation.activateTab(tab.id)}
              >
                {`activate ${tab.id}`}
              </button>
            ))}
            <output data-testid="tab-ids">
              {navigation.tabs.tabs.map((tab) => tab.id).join(',')}
            </output>
            <output data-testid="tab-titles">
              {navigation.tabs.tabs.map((tab) => tab.title).join(',')}
            </output>
            <output data-testid="active-tab">{navigation.tabs.activeTabId ?? ''}</output>
          </div>
        </AppWorkspace.Primary>
      </AppWorkspace>
    );
  }

  function mount() {
    Object.keys(verdict).forEach((key) => delete verdict[key]);
    asked.length = 0;

    return render(
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <Host />
        </AppShell>
      </AppWorkspaceProvider>,
    );
  }

  const click = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name, hidden: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const active = () => screen.getByTestId('active-tab').textContent;
  const ids = () => (screen.getByTestId('tab-ids').textContent ?? '').split(',').filter(Boolean);

  it('one tab per object: opening the same object again activates it, another object gets its own, labels differ', async () => {
    mount();
    await click('tab a');
    await click('tab b');
    expect(ids()).toEqual(['object:a', 'object:b']);
    expect(screen.getByTestId('tab-titles').textContent).toBe('Object a,Object b');

    await click('tab a'); // The same object from another entry point: activate, never a second tab.
    expect(ids()).toEqual(['object:a', 'object:b']);
    expect(active()).toBe('object:a');
    expect(screen.getByText('Content a')).toBeTruthy();
  });

  it('activateTab asks the visible tab guard first, and a refusal keeps it shown', async () => {
    mount();
    await click('tab a');
    await click('tab b');
    asked.length = 0;

    verdict.b = false;
    await click('activate object:a');
    expect(asked).toEqual(['b']);
    expect(active()).toBe('object:b');
    expect(screen.getByText('Content b')).toBeTruthy();

    verdict.b = true;
    await click('activate object:a');
    expect(asked).toEqual(['b', 'b']);
    expect(active()).toBe('object:a');
  });

  it('openTab asks the visible tab guard when it switches to an open tab and when it adds a tab', async () => {
    mount();
    await click('tab a');
    asked.length = 0;

    verdict.a = false;
    await click('tab b'); // A new tab leaves A (it unmounts): refused.
    expect(asked).toEqual(['a']);
    expect(ids()).toEqual(['object:a']);
    expect(active()).toBe('object:a');

    verdict.a = true;
    await click('tab b');
    expect(ids()).toEqual(['object:a', 'object:b']);
    expect(active()).toBe('object:b');

    verdict.b = false;
    await click('tab a'); // The switch path of openTab.
    expect(active()).toBe('object:b');
    verdict.b = true;
    await click('tab a');
    expect(active()).toBe('object:a');
  });

  it('opening the already shown tab asks nothing', async () => {
    mount();
    await click('tab a');
    asked.length = 0;

    await click('tab a');
    expect(asked).toEqual([]);
  });

  it('open() leaves another visible tab, so it asks that tab guard as well', async () => {
    mount();
    await click('tab a');
    asked.length = 0;

    verdict.a = false;
    await click('open plain');
    expect(asked).toEqual(['a']);
    expect(screen.queryByText('Plain content')).toBeNull();

    verdict.a = true;
    await click('open plain');
    expect(screen.getByText('Plain content')).toBeTruthy();
  });
});

describe('root tabs: scroll memory', () => {
  // jsdom has no layout: give every element a 1000px content in a 100px viewport.
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Panel({ memoryKey }: { memoryKey: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useSecondaryScrollMemory(ref, memoryKey);

    return (
      <div ref={ref}>
        <div data-testid="outer" style={{ overflowY: 'auto' }}>
          <div data-testid="inner" style={{ overflowY: 'scroll' }} />
        </div>
      </div>
    );
  }

  function withMemory(children: ReactNode, memory = createSecondaryScrollMemory()) {
    return (
      <SecondaryScrollMemoryContext.Provider value={memory}>
        {children}
      </SecondaryScrollMemoryContext.Provider>
    );
  }

  const scrollTo = (testId: string, top: number) => {
    const element = screen.getByTestId(testId);
    element.scrollTop = top;
    fireEvent.scroll(element);
  };

  it('restores each scroll container offset when the same (tab, entry) panel is shown again', async () => {
    const memory = createSecondaryScrollMemory();
    const first = render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    scrollTo('outer', 200);
    scrollTo('inner', 40);
    first.unmount();

    render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    expect(screen.getByTestId('outer').scrollTop).toBe(200);
    expect(screen.getByTestId('inner').scrollTop).toBe(40);
  });

  it('keeps entries and tabs apart, and forgets a popped entry or a closed tab', () => {
    const memory = createSecondaryScrollMemory();
    const first = render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    scrollTo('outer', 200);
    first.unmount();

    const other = render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 2)} />, memory));
    expect(screen.getByTestId('outer').scrollTop).toBe(0); // A different entry of the same tab.
    other.unmount();

    memory.forget('tab', 1);
    render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    expect(screen.getByTestId('outer').scrollTop).toBe(0);
  });

  it('forgetting a tab drops every entry of it and nothing of another tab', () => {
    const memory = createSecondaryScrollMemory();
    memory.remember(secondaryScrollKey('one', 1), 0, 10);
    memory.remember(secondaryScrollKey('one', 2), 0, 20);
    memory.remember(secondaryScrollKey('other', 1), 0, 30);

    memory.forgetTab('one');

    expect(memory.recall(secondaryScrollKey('one', 1))).toBeUndefined();
    expect(memory.recall(secondaryScrollKey('one', 2))).toBeUndefined();
    expect(memory.recall(secondaryScrollKey('other', 1))?.get(0)).toBe(30);
  });

  it('scrolling back to the top forgets the offset', () => {
    const memory = createSecondaryScrollMemory();
    const first = render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    scrollTo('outer', 200);
    scrollTo('outer', 0);
    first.unmount();

    render(withMemory(<Panel memoryKey={secondaryScrollKey('tab', 1)} />, memory));
    expect(screen.getByTestId('outer').scrollTop).toBe(0);
  });

  it('is inert without a provider', () => {
    render(<Panel memoryKey="x" />);
    scrollTo('outer', 50);
    expect(screen.getByTestId('outer').scrollTop).toBe(50);
  });
});
