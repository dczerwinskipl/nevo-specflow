// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext, sessionContextStack } from './SessionContext';
import { SessionContextSourceProvider } from './sessionContextValue';
import type { SessionContextTaskRef, SessionContextViewModel } from './sessionContextTypes';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sessionId = 's-1';
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** Mimics the Session screens' narrow Context button. */
function NarrowHost() {
  const navigation = useSecondaryNavigation();

  return (
    <button type="button" onClick={() => void navigation.open(sessionContextStack, {})}>
      open-context
    </button>
  );
}

function Environment({
  value,
  split,
  children,
}: {
  value: SessionContextViewModel;
  split: 'dynamic' | 'primary';
  children: React.ReactNode;
}) {
  return (
    <StoryLocalization locale="en">
      <AppWorkspaceProvider>
        <SessionContextSourceProvider sessionId={sessionId} value={value}>
          <AppShell navigation={<div>Nav</div>}>
            <AppWorkspace split={split}>
              <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
                {children}
              </AppWorkspace.Primary>
            </AppWorkspace>
          </AppShell>
        </SessionContextSourceProvider>
      </AppWorkspaceProvider>
    </StoryLocalization>
  );
}

describe('F14 the narrow Context flow shows the live view model', () => {
  const loading: SessionContextViewModel = {
    scope: { kind: 'standalone' },
    executor: { status: 'loading' },
  };
  const ready: SessionContextViewModel = {
    scope: { kind: 'standalone' },
    executor: { status: 'ready', value: { providerId: 'claude', providerTitle: 'Claude Code' } },
  };

  it('a Context opened while loading shows the data once the value changes', async () => {
    const tree = (value: SessionContextViewModel) => (
      <Environment value={value} split="dynamic">
        <NarrowHost />
      </Environment>
    );
    const { rerender } = render(tree(loading));
    await flush();
    fireEvent.click(screen.getByText('open-context'));
    await flush();
    expect(screen.queryByText('Claude Code')).toBeNull();

    rerender(tree(ready));
    await flush();

    expect(screen.queryByText('Claude Code')).not.toBeNull();
  });
});

/** The Context row (a button) of a Task; the open tab's own heading shares the text. */
const contextRow = (title: string) =>
  screen
    .getAllByText(title)
    .find((element) => element.closest('button'))!
    .closest('button')!;

describe('F13 Task tabs read the live Tasks', () => {
  const task: SessionContextTaskRef = { id: 't-1', key: 'TASK-01', title: 'Old title' };
  const renamed: SessionContextTaskRef = { ...task, title: 'New title' };
  const withTask = (current: SessionContextTaskRef): SessionContextViewModel => ({
    scope: { kind: 'specification' },
    executionScope: { status: 'ready', value: { kind: 'single-task', task: current } },
  });
  const tree = (value: SessionContextViewModel) => (
    <Environment value={value} split="primary">
      <SessionContext sessionId={sessionId} value={value} />
    </Environment>
  );

  it('a Task renamed after its tab opened shows the new title when it is opened again', async () => {
    const { rerender } = render(tree(withTask(task)));
    await flush();
    fireEvent.click(contextRow('Old title'));
    await flush();
    expect(await screen.findByRole('heading', { name: 'Old title' })).toBeTruthy();

    rerender(tree(withTask(renamed)));
    await flush();
    fireEvent.click(contextRow('New title'));
    await flush();

    expect(screen.queryByRole('heading', { name: 'New title' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Old title' })).toBeNull();
  });

  it('keeps one tab per Task, named by the Task key', async () => {
    const { rerender } = render(tree(withTask(task)));
    await flush();
    fireEvent.click(contextRow('Old title'));
    await flush();
    rerender(tree(withTask(renamed)));
    await flush();
    fireEvent.click(contextRow('New title'));
    await flush();

    expect(screen.getAllByText('TASK-01').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('heading', { name: 'New title' })).toHaveLength(1);
  });
});
