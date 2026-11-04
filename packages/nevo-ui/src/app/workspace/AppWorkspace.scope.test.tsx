// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import { AppWorkspaceProvider, useSecondaryNavigation } from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';

// Per-scope and per-instance identity of an `AppWorkspace`: the dynamic split's mode/ratio follow the
// provider's scope (workspace-dynamic-split.md §3), and the tab strip's element ids are unique per
// workspace instance.

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve();
    }
  });

function mockWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 600,
    toJSON: () => ({}),
  }));
}

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

describe('dynamic split ratio follows the provider scope', () => {
  function Host() {
    return (
      <AppShell navigation={<div>Nav</div>}>
        <AppWorkspace fit="available" split="dynamic">
          <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
            <div>Primary</div>
          </AppWorkspace.Primary>
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Secondary" />}>
            <div>Secondary</div>
          </AppWorkspace.Secondary>
        </AppWorkspace>
      </AppShell>
    );
  }

  const tree = (scope: string) => (
    <AppWorkspaceProvider scopeKey={scope}>
      <Host />
    </AppWorkspaceProvider>
  );
  const splitter = () => screen.getByRole('separator', { name: /resize/i });

  it('a manual ratio resets to auto when scopeKey changes while AppWorkspace stays mounted', async () => {
    mockWidth(1000);
    const { rerender } = render(tree('A'));
    await flush();
    const autoValue = splitter().getAttribute('aria-valuenow');

    fireEvent.keyDown(splitter(), { key: 'End' });
    await flush();
    const manualValue = splitter().getAttribute('aria-valuenow');
    expect(manualValue).not.toBe(autoValue);

    // Same scope again: the manual preference stays.
    rerender(tree('A'));
    await flush();
    expect(splitter().getAttribute('aria-valuenow')).toBe(manualValue);

    rerender(tree('B'));
    await flush();
    expect(splitter().getAttribute('aria-valuenow')).toBe(autoValue);
  });

  it('never renders the new scope with the old manual ratio, not even for one commit', async () => {
    mockWidth(1000);
    const { rerender } = render(tree('A'));
    await flush();
    const autoValue = splitter().getAttribute('aria-valuenow');
    fireEvent.keyDown(splitter(), { key: 'End' });
    await flush();

    const observed: (string | null)[] = [];
    const observer = new MutationObserver(() =>
      observed.push(splitter().getAttribute('aria-valuenow')),
    );
    observer.observe(splitter(), { attributes: true, attributeFilter: ['aria-valuenow'] });
    rerender(tree('B'));
    await flush();
    observer.disconnect();

    expect(observed.every((value) => value === autoValue)).toBe(true);
  });
});

describe('Secondary tab ids are unique per AppWorkspace instance', () => {
  it('two workspaces in one document never share a tab or panel id', async () => {
    function Host() {
      const navigation = useSecondaryNavigation();

      return (
        <AppWorkspace split="primary">
          <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
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
          </AppWorkspace.Primary>
        </AppWorkspace>
      );
    }

    render(
      <>
        {[1, 2].map((n) => (
          <AppWorkspaceProvider key={n}>
            <AppShell navigation={<div>Nav</div>}>
              <Host />
            </AppShell>
          </AppWorkspaceProvider>
        ))}
      </>,
    );
    for (const name of ['open a', 'open b']) {
      for (const button of screen.getAllByRole('button', { name, hidden: true })) {
        fireEvent.click(button);
        await flush();
      }
    }

    const ids = [...document.querySelectorAll('[id^="workspace-secondary-tabs"]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
