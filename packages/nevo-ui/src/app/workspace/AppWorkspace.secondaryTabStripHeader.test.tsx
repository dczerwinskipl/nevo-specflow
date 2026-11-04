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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: 1400,
    height: 56,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  }));
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.scrollTo ??= () => undefined;
  window.scrollTo = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const data = { status: 'ready' as 'ready' | 'loading' };

const stack = defineSecondaryStack<Record<never, never>, string, { page: Record<never, never> }>({
  id: 'strip-header-actions',
  initial: 'page',
  useData: () =>
    data.status === 'ready' ? { status: 'ready', data: 'Runtime' } : { status: 'loading' },
  tabLabel: () => 'Runtime',
  screens: {
    page: {
      title: 'Runtime page',
      component: () => <p>Runtime content</p>,
      menu: 'complete',
      actionLabels: { moreActions: 'Runtime actions' },
      actions: () => [
        { id: 'save', label: 'Save', primary: true, direct: 'always', onPress: () => undefined },
        { id: 'rename', label: 'Rename item', icon: 'edit', onPress: () => undefined },
        { id: 'archive', label: 'Archive item', group: 'actions', onPress: () => undefined },
      ],
    },
  },
});

function Host() {
  const navigation = useSecondaryNavigation();
  useRegisterPinnedSecondaryTab({ title: 'Context' });

  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        <button type="button" onClick={() => void navigation.openTab(stack, {})}>
          openTab Runtime
        </button>
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
        <p>Context content</p>
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

function tree() {
  return (
    <AppWorkspaceProvider>
      <AppShell navigation={<div>Nav</div>}>
        <Host />
      </AppShell>
    </AppWorkspaceProvider>
  );
}

const openRuntimeTab = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'openTab Runtime' }));
    await Promise.resolve();
  });
};

describe('Secondary root-tab strip keeps a runtime screen header actions', () => {
  it('renders the direct action and the complete menu with custom labels under the strip', async () => {
    data.status = 'ready';
    render(tree());
    await openRuntimeTab();
    await screen.findByText('Runtime content');

    expect(screen.getByRole('tab', { name: 'Runtime' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();

    const trigger = screen.getAllByRole('button', { name: 'Runtime actions', hidden: true })[0]!;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Save' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Rename item' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'Archive item' })).toBeTruthy();
  });

  it('keeps the strip and its heading while the runtime screen loads, then gains the actions in the same header', async () => {
    data.status = 'loading';
    const view = render(tree());
    await openRuntimeTab();

    expect(screen.getByRole('tab', { name: 'Runtime' })).toBeTruthy();
    expect(document.querySelector('h2[data-workspace-header-title]')?.textContent).toBe('Runtime');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    data.status = 'ready';
    await act(async () => {
      view.rerender(tree());
      await Promise.resolve();
    });
    await screen.findByText('Runtime content');

    expect(screen.getByRole('tab', { name: 'Runtime' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Runtime actions', hidden: true }),
    ).not.toHaveLength(0);
  });
});
