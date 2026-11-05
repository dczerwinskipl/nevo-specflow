// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useSecondaryLeaveGuard,
  useSecondaryStack,
  useWorkspace,
  type WorkspaceContextValue,
} from './WorkspaceContext';

interface Pages {
  list: Record<never, never>;
  child: Record<never, never>;
  leaf: { name: string };
}

const guard = { allow: true, calls: 0 };

function List() {
  const stack = useSecondaryStack<Pages>();

  return (
    <button type="button" onClick={() => void stack.navTo('child')}>
      Push child
    </button>
  );
}

function Child() {
  const stack = useSecondaryStack<Pages>();

  return (
    <>
      <button type="button" onClick={() => void stack.navTo('leaf', { name: 'admission.mjs' })}>
        Push leaf
      </button>
      <button type="button" onClick={() => void stack.navTo(fileStack, { path: 'src/a.ts' })}>
        Push file module
      </button>
    </>
  );
}

function Leaf() {
  useSecondaryLeaveGuard(() => {
    guard.calls += 1;

    return guard.allow;
  });

  return <p>Leaf page</p>;
}

const workStack = defineSecondaryStack<Record<never, never>, true, Pages>({
  id: 'work',
  initial: 'list',
  useData: () => ({ status: 'ready', data: true }),
  screens: {
    list: { title: 'Work history', component: List },
    child: { title: 'Child', component: Child },
    leaf: {
      title: 'Tool actions',
      breadcrumbLabel: ({ name }) => `Read file ${name}`,
      component: Leaf,
    },
  },
});

const fileStack = defineSecondaryStack<{ path: string }, true, { file: Record<never, never> }>({
  id: 'file',
  initial: 'file',
  tabLabel: ({ path }) => path.split('/').at(-1) ?? path,
  useData: () => ({ status: 'ready', data: true }),
  screens: { file: { title: 'File', component: () => <p>File page</p> } },
});

let workspace: WorkspaceContextValue | null = null;
function Host() {
  const current = useWorkspace();
  workspace = current;

  return (
    <>
      <output data-testid="trail">{current.trail.map((item) => item.title).join(' > ')}</output>
      <output data-testid="tabs">{current.tabs.tabs.map((tab) => tab.title).join(',')}</output>
      <output data-testid="action">{`${current.transition.action}#${current.transition.revision}`}</output>
      {current.secondary
        ? (current.secondary.surface.wrap?.(current.secondary.surface.content) ??
          current.secondary.surface.content)
        : null}
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

async function openToLeaf() {
  render(
    <AppWorkspaceProvider>
      <Host />
    </AppWorkspaceProvider>,
  );
  await act(async () => {
    await workspace!.openTab(workStack, {});
  });
  await click('Push child');
  await click('Push leaf');
}

afterEach(() => {
  cleanup();
  workspace = null;
  guard.allow = true;
  guard.calls = 0;
});

describe('Secondary trail and backTo', () => {
  it('keeps the tab label at the root title and names every level in the trail', async () => {
    await openToLeaf();

    expect(text('tabs')).toBe('Work history');
    expect(text('trail')).toBe('Work history > Child > Read file admission.mjs');
    expect(workspace!.trail.map((item) => item.key)).toHaveLength(3);
  });

  it('names a pushed module level by its own stack tabLabel', async () => {
    render(
      <AppWorkspaceProvider>
        <Host />
      </AppWorkspaceProvider>,
    );
    await act(async () => {
      await workspace!.openTab(workStack, {});
    });
    await click('Push child');
    await click('Push file module');

    expect(text('trail')).toBe('Work history > Child > a.ts');
    expect(text('tabs')).toBe('Work history');
  });

  it('pops several levels in one pop transition', async () => {
    await openToLeaf();
    const revision = Number(text('action').split('#')[1]);

    let result = false;
    await act(async () => {
      result = await workspace!.backTo(1);
    });

    expect(result).toBe(true);
    expect(text('trail')).toBe('Work history');
    expect(text('action')).toBe(`pop#${revision + 1}`);
    expect(screen.getByRole('button', { name: 'Push child' })).toBeTruthy();
    expect(guard.calls).toBe(1);
  });

  it('refuses a depth that is not an ancestor without consulting the guard', async () => {
    await openToLeaf();

    for (const depth of [0, 3, 4, -1]) {
      let result = true;
      await act(async () => {
        result = await workspace!.backTo(depth);
      });
      expect(result).toBe(false);
    }

    expect(guard.calls).toBe(0);
    expect(text('trail')).toBe('Work history > Child > Read file admission.mjs');
  });

  it('keeps the page when its leave guard refuses the jump', async () => {
    await openToLeaf();
    guard.allow = false;

    let result = true;
    await act(async () => {
      result = await workspace!.backTo(1);
    });

    expect(result).toBe(false);
    expect(screen.getByText('Leaf page')).toBeTruthy();
    expect(text('trail')).toBe('Work history > Child > Read file admission.mjs');
  });
});
