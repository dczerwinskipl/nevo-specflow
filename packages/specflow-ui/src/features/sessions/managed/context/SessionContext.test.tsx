// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  defineSecondaryStack,
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext } from './SessionContext';
import { SessionContextSourceProvider } from './sessionContextValue';
import { fullTelemetrySnapshot } from './sessionTelemetry.stories-support';
import type { ContextFact } from './sessionContextTypes';
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
const ready = <T,>(value: T): ContextFact<T> => ({ status: 'ready', value });
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
        <li key={tab.id} data-active={tab.id === tabs.activeTabId}>
          {tab.title}
        </li>
      ))}
    </ul>
  );
}

const tabLabels = () =>
  [...screen.getByLabelText('open-tabs').querySelectorAll('li')].map((tab) => tab.textContent);
const activeTabLabel = () =>
  screen.getByLabelText('open-tabs').querySelector('li[data-active="true"]')?.textContent;

function clickButtonByText(text: string) {
  const trigger = screen.getByText(text).closest('button');
  if (!trigger) {
    throw new Error(`Expected "${text}" to be inside a clickable row.`);
  }

  fireEvent.click(trigger);
}

async function renderContextWithRelatedTasks(
  value: SessionContextViewModel,
  options?: { workStack?: Parameters<typeof SessionContext>[0]['workStack'] },
) {
  render(
    <StoryLocalization locale="en">
      <AppWorkspaceProvider>
        <SessionContextSourceProvider
          sessionId={sessionId}
          value={value}
          workStack={options?.workStack}
        >
          <AppShell navigation={<div>Nav</div>}>
            <AppWorkspace split="primary">
              <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
                <TabTitles />
                <SessionContext
                  sessionId={sessionId}
                  value={value}
                  workStack={options?.workStack}
                />
              </AppWorkspace.Primary>
            </AppWorkspace>
          </AppShell>
        </SessionContextSourceProvider>
      </AppWorkspaceProvider>
    </StoryLocalization>,
  );
  // Let the initial render settle before the first click.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Related Tasks summary row', () => {
  it('renders one navigational summary row — never the individual Task list — on Context itself', async () => {
    const value: SessionContextViewModel = {
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'generic' }),
      relatedTasks: ready([task02, task03]),
    };

    await renderContextWithRelatedTasks(value);

    // Context is an entry point into its subjects, not a dump of every related Task inline
    // (live-review correction): a count-based summary row, never an individual Task's title.
    expect(screen.getByText('2 Tasks')).toBeTruthy();
    expect(screen.queryByText('Document the admission guard')).toBeNull();
    expect(screen.queryByText('Deterministic admission')).toBeNull();
  });

  it('opens a single related Task directly, as its own tab named by the Task key', async () => {
    const value: SessionContextViewModel = {
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'generic' }),
      relatedTasks: ready([task02]),
    };

    await renderContextWithRelatedTasks(value);

    clickButtonByText('1 Task');
    await act(async () => {
      await Promise.resolve();
    });

    // One tab for that Task, named by its key (the object is the tab's identity) and deep-linked
    // straight to its detail, not forced through the list first.
    expect(tabLabels()).toEqual(['TASK-02']);
    expect(
      await screen.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeTruthy();
  });

  it('opens the shared Tasks list — not a direct per-Task tab — when more than one Task is related', async () => {
    const value: SessionContextViewModel = {
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'generic' }),
      relatedTasks: ready([task02, task03]),
    };

    await renderContextWithRelatedTasks(value);

    clickButtonByText('2 Tasks');
    await act(async () => {
      await Promise.resolve();
    });

    // Reuses the existing Tasks list screen as the dedicated subject view (previously reachable
    // only via a separate "Open Tasks" button) — no new list screen invented for this fix.
    const openTabs = screen.getByLabelText('open-tabs');
    expect(within(openTabs).getByText('Tasks')).toBeTruthy();
  });

  it('selecting a Task from the list opens that Task as its own tab beside the list', async () => {
    const value: SessionContextViewModel = {
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'generic' }),
      relatedTasks: ready([task02, task03]),
    };
    await renderContextWithRelatedTasks(value);

    clickButtonByText('2 Tasks');
    await act(async () => {
      await Promise.resolve();
    });
    expect(tabLabels()).toEqual(['Tasks']);

    clickButtonByText('Document the admission guard');
    await act(async () => {
      await Promise.resolve();
    });

    // The list tab is untouched and the Task is its own tab, not a page inside the list.
    expect(tabLabels()).toEqual(['Tasks', 'TASK-02']);
    expect(activeTabLabel()).toBe('TASK-02');
  });

  it('one tab per Task: another Task gets its own tab, and re-opening an open Task activates it', async () => {
    // Previously a single shared Tasks tab: opening Task B while Task A was open only re-activated
    // that tab, which kept showing Task A. The tab identity is now the Task.
    const value: SessionContextViewModel = {
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'single-task', task: task02 }),
      relatedTasks: ready([task03]),
    };

    await renderContextWithRelatedTasks(value);

    clickButtonByText('Document the admission guard');
    await act(async () => {
      await Promise.resolve();
    });
    expect(tabLabels()).toEqual(['TASK-02']);
    expect(
      await screen.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeTruthy();

    clickButtonByText('1 Task');
    await act(async () => {
      await Promise.resolve();
    });
    expect(tabLabels()).toEqual(['TASK-02', 'TASK-03']);
    expect(activeTabLabel()).toBe('TASK-03');
    expect(await screen.findByRole('heading', { name: 'Deterministic admission' })).toBeTruthy();

    // Task A again: its existing tab is activated (no third tab, no retarget of B's).
    clickButtonByText('Document the admission guard');
    await act(async () => {
      await Promise.resolve();
    });
    expect(tabLabels()).toEqual(['TASK-02', 'TASK-03']);
    expect(activeTabLabel()).toBe('TASK-02');
    expect(
      await screen.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeTruthy();
  });

  it('on the narrow Context flow a Task is a push onto that flow (no tab), flagged inFlow', () => {
    const openStack = vi.fn(() => Promise.resolve(true));
    render(
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext
            sessionId={sessionId}
            value={{
              scope: { kind: 'specification' },
              executionScope: ready({ kind: 'single-task', task: task02 }),
            }}
            openStack={openStack}
          />
        </AppWorkspaceProvider>
      </StoryLocalization>,
    );

    clickButtonByText('Document the admission guard');
    clickButtonByText('Document the admission guard');

    // Every selection pushes again (Back follows the path, duplicates included).
    expect(openStack).toHaveBeenCalledTimes(2);
    expect(openStack).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'managed-session-task' }),
      { sessionId, taskId: 'task-02', taskKey: 'TASK-02', inFlow: true },
    );
  });
});

describe('navigation skeleton (other root tabs)', () => {
  it('opens a real Secondary tab with a clearly-labelled placeholder screen for each of the five remaining placeholder subjects', async () => {
    const value: SessionContextViewModel = { scope: { kind: 'standalone' } };
    await renderContextWithRelatedTasks(value);

    clickButtonByText('Files / Changes');
    await act(async () => {
      await Promise.resolve();
    });

    const openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(1);
    expect(within(openTabs).getByText('Files / Changes')).toBeTruthy();
    // A real, navigable tab — not faked content: an honestly-labelled "not implemented yet"
    // placeholder, same shared screen every one of the six subjects uses today.
    expect(screen.getByText('This area is a preview — its content will come later.')).toBeTruthy();
  });

  it("opens each remaining subject as its OWN independent tab, never reusing another subject's tab", async () => {
    const value: SessionContextViewModel = { scope: { kind: 'standalone' } };
    await renderContextWithRelatedTasks(value);

    clickButtonByText('Instructions');
    await act(async () => {
      await Promise.resolve();
    });
    clickButtonByText('Environment');
    await act(async () => {
      await Promise.resolve();
    });

    const openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(2);
    expect(within(openTabs).getByText('Instructions')).toBeTruthy();
    expect(within(openTabs).getByText('Environment')).toBeTruthy();
  });
});

describe('Work history row', () => {
  // Minimal stand-in for `createWorkInspector`'s own stack, same shape (`{sessionId, turnId}` ->
  // a tab titled "Work history"), sufficient to test `SessionContext`'s own wiring (row
  // visibility, which params it opens with) without needing a full `ManagedSessionsApi`/
  // `SessionFeed` — `WorkInspector.tsx`'s own tests cover what that real stack renders.
  function fakeWorkStack(received: { params: unknown }[]) {
    return defineSecondaryStack<
      { sessionId: string; turnId: string },
      { sessionId: string; turnId: string },
      { work: object }
    >({
      id: 'managed-session-work',
      initial: 'work',
      instanceId: (params) => params.turnId,
      tabLabel: (params) => `Work history ${params.turnId.slice(-2)}`,
      useData: (params) => {
        received.push({ params });

        return { status: 'ready', data: params };
      },
      screens: {
        work: { title: 'Work history', component: () => <div>Work history content</div> },
      },
    });
  }

  it('does not render the Work section when no Work history fact is known, even with a workStack available', async () => {
    const received: { params: unknown }[] = [];
    await renderContextWithRelatedTasks(
      { scope: { kind: 'standalone' } },
      { workStack: fakeWorkStack(received) },
    );

    expect(screen.queryByText('Work history')).toBeNull();
    expect(screen.queryByText('Work')).toBeNull();
  });

  it('does not render when the Turn is known but no workStack is passed', async () => {
    await renderContextWithRelatedTasks({
      scope: { kind: 'specification' },
      workHistory: ready({ turnId: '00000000-0000-4000-8000-000000000099' }),
    });

    expect(screen.queryByText('Work history')).toBeNull();
  });

  it('renders in its own Work section and opens the shared Work tab for the current Turn', async () => {
    const received: { params: unknown }[] = [];
    const turnId = '00000000-0000-4000-8000-000000000099';
    await renderContextWithRelatedTasks(
      { scope: { kind: 'standalone' }, workHistory: ready({ turnId }) },
      { workStack: fakeWorkStack(received) },
    );

    const section = screen.getByText('Work').closest('section')!;
    expect(section.textContent).toContain('Work history');
    // Planned areas do not own it any more.
    expect(screen.getByText('Planned areas').closest('section')!.textContent).not.toContain(
      'Work history',
    );

    clickButtonByText('Work history');
    await act(async () => {
      await Promise.resolve();
    });

    expect(tabLabels()).toEqual(['Work history 99']);
    expect(received).toContainEqual({ params: { sessionId, turnId } });

    // The same Turn again (Context row, or a chat Work block calling `openTab` with the same
    // params) activates that tab instead of adding a second one.
    fireEvent.click(within(section).getByText('Work history'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(tabLabels()).toEqual(['Work history 99']);
  });

  it('names the Turn "Current Turn" while it runs and "Last Turn" once it has settled', () => {
    const turnId = '00000000-0000-4000-8000-000000000099';
    const received: { params: unknown }[] = [];
    const { rerender } = renderWork(
      { scope: { kind: 'standalone' }, workHistory: ready({ turnId }), runningTurnId: turnId },
      fakeWorkStack(received),
    );
    expect(screen.getByText('Current Turn')).toBeTruthy();

    rerender({ scope: { kind: 'standalone' }, workHistory: ready({ turnId }) });
    expect(screen.getByText('Last Turn')).toBeTruthy();
  });

  it.each(['unreadable', 'missing'] as const)(
    'shows a warning in the Work section when the work history is %s, never hides it (F35)',
    (status) => {
      renderWork({ scope: { kind: 'standalone' }, workHistory: { status } }, fakeWorkStack([]));

      const section = screen.getByRole('region', { name: 'Work' });
      expect(section.textContent).toContain('Couldn’t load the work history.');
      expect(section.getAttribute('aria-busy')).toBeNull();
    },
  );

  it('shows the Work label with a busy skeleton while the history is loading', () => {
    const received: { params: unknown }[] = [];
    renderWork(
      { scope: { kind: 'standalone' }, workHistory: { status: 'loading' } },
      fakeWorkStack(received),
    );

    const section = screen.getByText('Work').closest('section')!;
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.querySelectorAll('[data-context-skeleton-row]')).toHaveLength(1);
    expect(screen.queryByText('Work history')).toBeNull();
  });

  function renderWork(
    value: SessionContextViewModel,
    workStack: Parameters<typeof SessionContext>[0]['workStack'],
  ) {
    const tree = (v: SessionContextViewModel) => (
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext sessionId={sessionId} value={v} workStack={workStack} />
        </AppWorkspaceProvider>
      </StoryLocalization>
    );
    const view = render(tree(value));

    return { rerender: (next: SessionContextViewModel) => view.rerender(tree(next)) };
  }
});

describe('data states', () => {
  function renderContext(
    value: SessionContextViewModel,
    handlers: Partial<Parameters<typeof SessionContext>[0]> = {},
  ) {
    return render(
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext sessionId={sessionId} value={value} {...handlers} />
        </AppWorkspaceProvider>
      </StoryLocalization>,
    );
  }

  const executor = ready({ providerId: 'claude', providerTitle: 'Claude', modelTitle: 'Opus' });

  it('gives every section a heading that names its region (F37)', () => {
    renderContext({
      scope: { kind: 'standalone' },
      executor,
      telemetry: fullTelemetrySnapshot,
    });

    for (const name of ['Agent', 'Session usage']) {
      const region = screen.getByRole('region', { name });
      expect(within(region).getByRole('heading', { level: 3, name })).toBeTruthy();
    }

    expect(screen.getByRole('region', { name: 'Provider limits' })).toBeTruthy();
  });

  it('association loading: executor and planned areas, no note and no Specification skeleton; never a full-pane EmptyState', () => {
    const { container } = renderContext({
      scope: { kind: 'unknown', reason: 'loading' },
      executor,
    });

    expect(container.querySelector('[data-empty-state="pane"]')).toBeNull();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(container.querySelector('[data-context-skeleton-row]')).toBeNull();
    expect(screen.queryByText(/Couldn’t load this session’s links/)).toBeNull();
    for (const absent of ['Specification', 'Current execution', 'Attention / next actions']) {
      expect(screen.queryByText(absent)).toBeNull();
    }

    expect(screen.getByText('Planned areas')).toBeTruthy();
  });

  it('a standalone Session shows no scope note at all', () => {
    renderContext({ scope: { kind: 'standalone' }, executor });

    expect(screen.queryByText(/Couldn’t load this session’s links/)).toBeNull();
    expect(screen.queryByText('Specification')).toBeNull();
  });

  it('unreadable associations warn with the attention tone, not the info note', () => {
    const { container } = renderContext({
      scope: { kind: 'unknown', reason: 'unreadable' },
      executor,
    });

    expect(screen.getByText('Couldn’t load this session’s links.')).toBeTruthy();
    expect(container.querySelector('.text-status-attention')).toBeTruthy();
  });

  it('groups the five placeholder rows in one flat "Planned areas" section and says they are a preview', () => {
    renderContext({ scope: { kind: 'standalone' } });

    const section = screen.getByText('Planned areas').closest('section')!;
    for (const label of [
      'Files / Changes',
      'Handovers',
      'Artifacts',
      'Instructions',
      'Environment',
    ]) {
      expect(within(section).getByText(label)).toBeTruthy();
    }

    // No sub-group headings any more.
    expect(screen.queryByText('Results & resources')).toBeNull();
    expect(screen.queryByText('History & reference')).toBeNull();
    expect(screen.queryByText('Other areas')).toBeNull();
  });

  it('loading sections keep their label, are aria-busy and show skeleton rows (executor)', () => {
    renderContext({
      scope: { kind: 'unknown', reason: 'loading' },
      executor: { status: 'loading' },
    });

    const section = screen.getByText('Agent').closest('section')!;
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.querySelectorAll('[data-context-skeleton-row]')).toHaveLength(1);
  });

  it('a Specification loading shows two skeleton rows (identity + Documents) when Documents is wired', () => {
    renderContext(
      { scope: { kind: 'specification' }, specification: { status: 'loading' } },
      { onOpenSpecification: vi.fn(), onOpenDocuments: vi.fn() },
    );

    const section = screen.getByText('Specification').closest('section')!;
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.querySelectorAll('[data-context-skeleton-row]')).toHaveLength(2);
    expect(screen.queryByText('Documents')).toBeNull();
  });

  it('a Task-scoped execution loading shows min(taskCount, 3) skeleton rows', () => {
    renderContext({
      scope: { kind: 'task', taskCount: 5 },
      executionScope: { status: 'loading' },
    });

    const section = screen.getByText('Current execution').closest('section')!;
    expect(section.querySelectorAll('[data-context-skeleton-row]')).toHaveLength(3);
  });

  it('unreadable Specification warns; a required missing one is a danger note naming its key', () => {
    const { container, unmount } = renderContext(
      { scope: { kind: 'specification' }, specification: { status: 'unreadable' } },
      { onOpenSpecification: vi.fn() },
    );
    expect(screen.getByText('Couldn’t load this session’s Specification.')).toBeTruthy();
    expect(container.querySelector('.text-status-danger')).toBeNull();
    unmount();

    const missing = renderContext(
      {
        scope: { kind: 'specification' },
        specification: { status: 'missing', ref: { key: 'SPEC-A' } },
      },
      { onOpenSpecification: vi.fn() },
    );
    expect(
      screen.getByText('Can’t find specification SPEC-A associated with this session.'),
    ).toBeTruthy();
    expect(missing.container.querySelector('.text-status-danger')).toBeTruthy();
  });

  it('a forbidden Specification is an info note without the Documents row', () => {
    const { container } = renderContext(
      { scope: { kind: 'specification' }, specification: { status: 'forbidden' } },
      { onOpenSpecification: vi.fn(), onOpenDocuments: vi.fn() },
    );

    expect(
      screen.getByText(
        'You don’t have permission to view the specification associated with this session.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(container.querySelector('.text-status-danger')).toBeNull();
  });

  it('an archived Specification says so on its row', () => {
    renderContext(
      {
        scope: { kind: 'specification' },
        specification: ready({ id: 's', key: 'SPEC-1', title: 'Auth', collection: 'archived' }),
      },
      { onOpenSpecification: vi.fn() },
    );

    expect(screen.getByRole('button', { name: /Auth.*Archived/ })).toBeTruthy();
  });

  it('counts associated Tasks that cannot be found beside the found ones, and alone when none is', () => {
    const { unmount } = renderContext({
      scope: { kind: 'specification' },
      relatedTasks: ready([task02]),
      relatedTasksMissing: { count: 1, total: 2 },
    });
    expect(screen.getByText('1 of 2 associated tasks can’t be found.')).toBeTruthy();
    expect(screen.getByText('1 Task')).toBeTruthy();
    unmount();

    renderContext({
      scope: { kind: 'specification' },
      relatedTasks: ready([]),
      relatedTasksMissing: { count: 2, total: 2 },
    });
    expect(screen.getByText('2 of 2 associated tasks can’t be found.')).toBeTruthy();
    expect(screen.getByText('Related Tasks')).toBeTruthy();
  });

  it('a missing Specification stays a warning when the scope does not require it', () => {
    // Task/specification scope require it; a missing optional reference must not be an error.
    const { container } = renderContext({
      scope: { kind: 'unknown', reason: 'loading' },
      specification: { status: 'missing' },
    });

    // Not present for an unknown scope at all.
    expect(screen.queryByText('Specification')).toBeNull();
    expect(container.querySelector('.text-status-danger')).toBeNull();
  });

  it('a missing required Task is a danger note; a partially missing batch keeps the found Tasks beside it', () => {
    const { container, unmount } = renderContext({
      scope: { kind: 'task', taskCount: 1 },
      executionScope: { status: 'missing', ref: { key: 'TASK-03' } },
    });
    expect(
      screen.getByText('Can’t find TASK-03, the Task this session is executing.'),
    ).toBeTruthy();
    expect(container.querySelector('.text-status-danger')).toBeTruthy();
    unmount();

    renderContext({
      scope: { kind: 'task', taskCount: 3 },
      executionScope: ready({
        kind: 'batch',
        tasks: [task02, task03],
        missingTaskCount: 1,
      }),
    });
    expect(screen.getByText('1 of 3 Tasks for this session can’t be found.')).toBeTruthy();
    expect(screen.getByText('Document the admission guard')).toBeTruthy();
    expect(screen.getByText('Deterministic admission')).toBeTruthy();
  });

  it('unreadable execution, Attention and Related Tasks each warn in their own slot', () => {
    renderContext({
      scope: { kind: 'task', taskCount: 1 },
      executionScope: { status: 'unreadable' },
      attention: { status: 'unreadable' },
      relatedTasks: { status: 'missing' },
    });

    expect(screen.getByText('Couldn’t load the Tasks being executed.')).toBeTruthy();
    expect(screen.getByText('Couldn’t check whether anything needs your attention.')).toBeTruthy();
    expect(screen.getByText('Couldn’t load related Tasks.')).toBeTruthy();
  });

  it('omits Attention and Related Tasks when their ready list is empty', () => {
    renderContext({
      scope: { kind: 'task', taskCount: 1 },
      attention: ready([]),
      relatedTasks: ready([]),
    });

    expect(screen.queryByText('Attention / next actions')).toBeNull();
    expect(screen.queryByText('Related Tasks')).toBeNull();
  });

  it('executor unreadable warns and missing is a danger note', () => {
    const { container, unmount } = renderContext({
      scope: { kind: 'standalone' },
      executor: { status: 'unreadable' },
    });
    expect(screen.getByText('Couldn’t load executor details.')).toBeTruthy();
    expect(container.querySelector('.text-status-danger')).toBeNull();
    unmount();

    const missing = renderContext({
      scope: { kind: 'standalone' },
      executor: { status: 'missing' },
    });
    expect(screen.getByText('This session’s executor is no longer available.')).toBeTruthy();
    expect(missing.container.querySelector('.text-status-danger')).toBeTruthy();
  });

  it('notes are passive: no live region role on any Context note', () => {
    const { container } = renderContext({
      scope: { kind: 'task', taskCount: 1 },
      executor: { status: 'unreadable' },
      specification: { status: 'missing', ref: { key: 'SPEC-A' } },
      executionScope: { status: 'missing' },
    });

    expect(container.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });

  it('renders a short-but-real Context without artificial vertical centering', () => {
    const { container } = renderContext({
      scope: { kind: 'specification' },
      executionScope: ready({ kind: 'generic' }),
    });

    // Confirmed live-review bug: an `m-auto` wrapper centred short Context content vertically
    // inside the tall panel instead of starting at the top like every other scrolled surface.
    expect(container.querySelector('.m-auto')).toBeNull();
    expect(container.textContent).toContain('Generic / Spec-level');
    const scrollContent = container.querySelector('.scroll-area-content');
    expect(scrollContent?.className).toMatch(/\bflex\b/);
    expect(scrollContent?.className).toMatch(/min-h-full/);
  });
});

describe('Specification entry', () => {
  const specification = { id: 'spec-a', key: 'SPEC-A', title: 'Workflow admission hardening' };

  function renderContext(
    value: SessionContextViewModel,
    onOpenSpecification?: (spec: { id: string; key: string; title: string }) => void,
  ) {
    return render(
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext
            sessionId={sessionId}
            value={value}
            onOpenSpecification={onOpenSpecification}
          />
        </AppWorkspaceProvider>
      </StoryLocalization>,
    );
  }

  it('weights a row by its information role: object identities semibold, navigation subjects regular, keys muted', () => {
    const task = { id: 'task-03', key: 'TASK-03', title: 'Deterministic admission' };
    renderContext(
      {
        scope: { kind: 'specification' },
        specification: ready(specification),
        executionScope: ready({ kind: 'single-task', task }),
        relatedTasks: ready([task, { id: 'task-02', key: 'TASK-02', title: 'Admission guard' }]),
      },
      vi.fn(),
    );

    // Specification and Task titles are the object's identity (DS primary information).
    expect(screen.getByText('Workflow admission hardening').className).toContain('text-title-sm');
    expect(screen.getByText('Deterministic admission').className).toContain('text-title-sm');
    // Navigation subjects and count summaries are not bold just because they are clickable.
    expect(screen.getByText('Files / Changes').className).toContain('text-body-md');
    expect(screen.getByText('2 Tasks').className).toContain('text-body-md');
    // Technical identifiers stay muted on the secondary line.
    expect(screen.getByText('SPEC-A').closest('.text-content-muted')).toBeTruthy();
  });

  it('renders a navigational Specification row when the view model carries one and a handler is wired, and opens it with the real specification reference on click', () => {
    const onOpenSpecification = vi.fn();
    renderContext(
      { scope: { kind: 'specification' }, specification: ready(specification) },
      onOpenSpecification,
    );

    expect(screen.getByText('Specification')).toBeTruthy();
    expect(screen.getByText('Workflow admission hardening')).toBeTruthy();
    expect(screen.getByText('SPEC-A')).toBeTruthy();

    clickButtonByText('Workflow admission hardening');

    expect(onOpenSpecification).toHaveBeenCalledWith(specification);
  });

  it('omits the Specification row entirely when no handler is wired, even though the view model carries a specification reference', () => {
    // No real navigation destination to offer without a wired handler (unlike the placeholder
    // root-tab rows, which always have at least the shared "not implemented yet" screen to fall
    // back to) — a row that looks clickable but does nothing would be worse than no row.
    renderContext({ scope: { kind: 'specification' }, specification: ready(specification) });

    expect(screen.queryByText('Specification')).toBeNull();
    expect(screen.queryByText('Workflow admission hardening')).toBeNull();
  });

  it('omits the Specification row when the view model carries no specification reference, even with a handler wired', () => {
    renderContext({ scope: { kind: 'standalone' } }, vi.fn());

    expect(screen.queryByText('Specification')).toBeNull();
  });

  it('adds a Documents row under the Specification row that opens the Specification Documents', () => {
    const onOpenDocuments = vi.fn();
    const { container } = render(
      <StoryLocalization locale="en">
        <AppWorkspaceProvider>
          <SessionContext
            sessionId={sessionId}
            value={{ scope: { kind: 'specification' }, specification: ready(specification) }}
            onOpenSpecification={vi.fn()}
            onOpenDocuments={onOpenDocuments}
          />
        </AppWorkspaceProvider>
      </StoryLocalization>,
    );

    const section = screen.getByText('Specification').closest('section')!;
    // Same list as the identity row, no count.
    expect(section.querySelectorAll('ul')).toHaveLength(1);
    expect(section.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('[data-context-skeleton-row]')).toBeNull();

    clickButtonByText('Documents');

    expect(onOpenDocuments).toHaveBeenCalledWith(specification);
  });

  it('omits the Documents row without a handler, and while the Specification is not ready', () => {
    renderContext(
      { scope: { kind: 'specification' }, specification: ready(specification) },
      vi.fn(),
    );
    expect(screen.queryByText('Documents')).toBeNull();
  });
});
