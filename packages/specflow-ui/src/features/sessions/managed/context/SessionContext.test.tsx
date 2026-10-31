// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext } from './SessionContext';
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

const sessionId = '00000000-0000-4000-8000-000000000001';
const task02: SessionContextTaskRef = {
  id: 'task-02',
  key: 'TASK-02',
  title: 'Document the admission guard',
};
const task03: SessionContextTaskRef = {
  id: 'task-03',
  key: 'TASK-03',
  title: 'Deterministic admission',
};

/** Surfaces the live Secondary tab strip's own labels (`SecondaryTabInfo.title`, the contract
 * `AppWorkspace`'s `ItemTabs` tab strip renders verbatim) without depending on that widget's own
 * width-based middle-truncation, which `ResizeObserver`'s jsdom stub never measures realistically. */
function TabTitles() {
  const { tabs } = useSecondaryNavigation();

  return (
    <ul aria-label="open-tabs">
      {tabs.tabs.map((tab) => (
        <li key={tab.id}>{tab.title}</li>
      ))}
    </ul>
  );
}

function clickTaskLink(key: string) {
  const trigger = screen.getByText(key).closest('button');
  if (!trigger) {
    throw new Error(`Expected "${key}" to be inside a TaskLink button.`);
  }

  fireEvent.click(trigger);
}

async function renderContextWithRelatedTasks(value: SessionContextViewModel) {
  render(
    <StoryLocalization locale="en">
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <AppWorkspace split="primary">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
              <TabTitles />
              <SessionContext sessionId={sessionId} value={value} />
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
      </AppWorkspaceProvider>
    </StoryLocalization>,
  );
  // Let the initial render settle before the first click.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Related Tasks -> openTab tab labels', () => {
  it('names each opened Task tab after the real Task, not the generic "Task" screen title', async () => {
    const value: SessionContextViewModel = {
      status: 'ready',
      executionScope: { kind: 'generic' },
      relatedTasks: [task02, task03],
    };

    await renderContextWithRelatedTasks(value);

    clickTaskLink('TASK-02');
    await act(async () => {
      await Promise.resolve();
    });
    clickTaskLink('TASK-03');
    await act(async () => {
      await Promise.resolve();
    });

    const openTabs = screen.getByLabelText('open-tabs');
    // Two distinct tabs, each carrying its own Task's identity — never the same generic label
    // twice (the live-review finding: "Zadanie (2)"/"Praca (2)" could not tell two instances of
    // the same stack apart).
    expect(within(openTabs).getByText('TASK-02 Document the admission guard')).toBeTruthy();
    expect(within(openTabs).getByText('TASK-03 Deterministic admission')).toBeTruthy();
    // Neither tab fell back to the active page's generic, undifferentiated screen title.
    expect(within(openTabs).queryByText('Task')).toBeNull();
  });
});

describe('sparse Context states', () => {
  function renderContext(value: SessionContextViewModel) {
    return render(
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext sessionId={sessionId} value={value} />
        </AppWorkspaceProvider>
      </StoryLocalization>,
    );
  }

  it('frames an unavailable Context as a deliberate EmptyState, full-height-centred, not a bare top-pinned line', () => {
    const { container } = renderContext({ status: 'unavailable' });

    const empty = container.querySelector('[data-empty-state="pane"]');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('Context is not available');

    // The scrolled content must be a definite-height flex column, otherwise `EmptyState`'s own
    // `flex-1 min-h-full ... justify-center` has nothing to fill/centre within and silently
    // collapses to the top of an otherwise-blank, full-viewport mobile panel.
    const scrollContent = container.querySelector('.scroll-area-content');
    expect(scrollContent?.className).toMatch(/\bflex\b/);
    expect(scrollContent?.className).toMatch(/min-h-full/);
  });

  it('frames a Context with every section absent as the same deliberate EmptyState', () => {
    const { container } = renderContext({ status: 'ready' });

    const empty = container.querySelector('[data-empty-state="pane"]');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('No additional context');
  });

  it('vertically centres a short-but-real Context instead of leaving it pinned to the top of a tall blank panel', () => {
    const { container } = renderContext({
      status: 'ready',
      executionScope: { kind: 'generic' },
    });

    const centered = container.querySelector('.m-auto');
    expect(centered).toBeTruthy();
    expect(centered?.textContent).toContain('Generic / Spec-level');
    // Its own scrolled ancestor has the definite full height the `m-auto` centring needs.
    const scrollContent = container.querySelector('.scroll-area-content');
    expect(scrollContent?.className).toMatch(/\bflex\b/);
    expect(scrollContent?.className).toMatch(/min-h-full/);
  });
});
