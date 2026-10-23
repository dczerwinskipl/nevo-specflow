// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import { AppWorkspaceProvider, useSecondaryNavigation } from './WorkspaceContext';
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
function Host({ stack }: { stack: ReturnType<typeof stackWith> }) {
  const navigation = useSecondaryNavigation();
  flags.isOpen.push(navigation.isOpen);
  close = navigation.close;
  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        <button type="button" onClick={() => void navigation.open(stack, {})}>
          Open stack
        </button>
        <output data-testid="open">{String(navigation.isOpen)}</output>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
function mount(stack: ReturnType<typeof stackWith>) {
  flags.isOpen = [];
  render(
    <AppWorkspaceProvider>
      <AppShell navigation={<div>Nav</div>}>
        <Host stack={stack} />
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
