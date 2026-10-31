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

function clickButtonByText(text: string) {
  const trigger = screen.getByText(text).closest('button');
  if (!trigger) {
    throw new Error(`Expected "${text}" to be inside a clickable row.`);
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

describe('Related Tasks summary row', () => {
  it('renders one navigational summary row — never the individual Task list — on Context itself', async () => {
    const value: SessionContextViewModel = {
      status: 'ready',
      executionScope: { kind: 'generic' },
      relatedTasks: [task02, task03],
    };

    await renderContextWithRelatedTasks(value);

    // Context is an entry point into its subjects, not a dump of every related Task inline
    // (live-review correction): a count-based summary row, never an individual Task's title.
    expect(screen.getByText('2 Tasks')).toBeTruthy();
    expect(screen.queryByText('Document the admission guard')).toBeNull();
    expect(screen.queryByText('Deterministic admission')).toBeNull();
  });

  it('opens a single related Task directly, inside the one stably-labelled Tasks tab', async () => {
    const value: SessionContextViewModel = {
      status: 'ready',
      executionScope: { kind: 'generic' },
      relatedTasks: [task02],
    };

    await renderContextWithRelatedTasks(value);

    clickButtonByText('1 Tasks');
    await act(async () => {
      await Promise.resolve();
    });

    // Exactly one new tab, stably labelled "Tasks" — full-session-screen-structure.md §10.1's own
    // "Work -> ToolAction stays inside the Work tab" rule: the tab's identity never renames itself
    // to whichever Task happens to be open inside it (that would flip between "Tasks" and the
    // generic "Task" screen title depending on navigation depth, not name the tab consistently).
    const openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(1);
    expect(within(openTabs).getByText('Tasks')).toBeTruthy();
    // Deep-linked straight to that one Task's own detail, not forced through the list first — the
    // real Task identity is still clear, just in the tab's content (`TaskDetail`'s own heading)
    // rather than the tab strip.
    expect(
      await screen.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeTruthy();
  });

  it('opens the shared Tasks list — not a direct per-Task tab — when more than one Task is related', async () => {
    const value: SessionContextViewModel = {
      status: 'ready',
      executionScope: { kind: 'generic' },
      relatedTasks: [task02, task03],
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

  it('reuses one Tasks tab across different entry points instead of one tab per Task (full-session-screen-structure.md §7.4/§10.1)', async () => {
    // A confirmed bug this corrects: Related Tasks used to open each Task as its own independent
    // root tab via a per-Task `instanceId` ("Do not spawn an independent tab for a task-bound
    // event and lose provenance" — §7.4). The current-execution Task (single-task scope) and a
    // Related Tasks entry must land in the SAME "Tasks" tab, never two.
    const value: SessionContextViewModel = {
      status: 'ready',
      executionScope: { kind: 'single-task', task: task02 },
      relatedTasks: [task03],
    };

    await renderContextWithRelatedTasks(value);

    // Opens the current-execution Task first: a fresh Tasks tab, deep-linked straight to TASK-02.
    clickButtonByText('Document the admission guard');
    await act(async () => {
      await Promise.resolve();
    });

    let openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(1);
    expect(within(openTabs).getByText('Tasks')).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Document the admission guard' }),
    ).toBeTruthy();

    // Opening the single related Task (TASK-03) activates the SAME existing tab rather than
    // creating a second one — `openTab`'s documented "already open: activate it, leaving its flow
    // untouched" behavior, so the tab keeps showing TASK-02, not TASK-03.
    clickButtonByText('1 Tasks');
    await act(async () => {
      await Promise.resolve();
    });

    openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('navigation skeleton (other root tabs)', () => {
  it('opens a real Secondary tab with a clearly-labelled placeholder screen for each of the six remaining subjects', async () => {
    const value: SessionContextViewModel = { status: 'ready' };
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
    expect(screen.getByText('This section is not implemented yet.')).toBeTruthy();
  });

  it("opens each remaining subject as its OWN independent tab, never reusing another subject's tab", async () => {
    const value: SessionContextViewModel = { status: 'ready' };
    await renderContextWithRelatedTasks(value);

    clickButtonByText('History');
    await act(async () => {
      await Promise.resolve();
    });
    clickButtonByText('Environment');
    await act(async () => {
      await Promise.resolve();
    });

    const openTabs = screen.getByLabelText('open-tabs');
    expect(openTabs.querySelectorAll('li')).toHaveLength(2);
    expect(within(openTabs).getByText('History')).toBeTruthy();
    expect(within(openTabs).getByText('Environment')).toBeTruthy();
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

  it('shows the inline "no additional context" note alongside the always-present navigation skeleton, not a full-pane EmptyState, once every dynamic section is absent', () => {
    // Part 2 (owner-greenlit navigation skeleton): a Context with every dynamic section
    // (execution/attention/related Tasks/telemetry) absent is no longer treated as literally
    // empty — `OtherAreasSection`'s six root-tab rows are a fixed entry point, not
    // session-derived content, so they are always there once Context is `ready`.
    const { container } = renderContext({ status: 'ready' });

    expect(container.querySelector('[data-empty-state="pane"]')).toBeNull();
    expect(screen.getByText('No additional context for this Turn.')).toBeTruthy();
    expect(screen.getByText('Other areas')).toBeTruthy();
    expect(screen.getByText('Files / Changes')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Handovers')).toBeTruthy();
    expect(screen.getByText('Artifacts')).toBeTruthy();
    expect(screen.getByText('Instructions')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
  });

  it('groups the six navigation-skeleton rows under two subsection labels instead of one flat list (live owner review, second pass)', () => {
    const { container } = renderContext({ status: 'ready' });

    expect(screen.getByText('Results & resources')).toBeTruthy();
    expect(screen.getByText('History & reference')).toBeTruthy();

    // Files/Changes, Handovers and Artifacts (produced/attached output) sit under "Results &
    // resources"; History, Instructions and Environment (background/setup material) sit under
    // "History & reference" — this pass's own grouping interpretation, not every six-row order
    // the owner's reference mock could imply.
    const resultsGroup = screen.getByText('Results & resources').closest('div');
    const referenceGroup = screen.getByText('History & reference').closest('div');
    expect(resultsGroup?.textContent).toContain('Files / Changes');
    expect(resultsGroup?.textContent).toContain('Handovers');
    expect(resultsGroup?.textContent).toContain('Artifacts');
    expect(resultsGroup?.textContent).not.toContain('History');
    expect(referenceGroup?.textContent).toContain('History');
    expect(referenceGroup?.textContent).toContain('Instructions');
    expect(referenceGroup?.textContent).toContain('Environment');
    expect(container.textContent).toContain('Other areas');
  });

  it('renders a short-but-real Context without artificial vertical centering', () => {
    const { container } = renderContext({
      status: 'ready',
      executionScope: { kind: 'generic' },
    });

    // Confirmed live-review bug: an `m-auto` wrapper centred short Context content vertically
    // inside the tall panel instead of starting at the top like every other scrolled surface —
    // this is one of the two contributors the owner traced the "wyśrodkowane w pionie" complaint
    // to (the other is `ManagedSession`'s own scroll architecture). A regression test previously
    // asserted the centring itself as correct behavior; this asserts its absence instead.
    expect(container.querySelector('.m-auto')).toBeNull();
    expect(container.textContent).toContain('Generic / Spec-level');
    // Its own scrolled ancestor still has the definite full height ordinary top-anchored content
    // needs to scroll correctly once it overflows.
    const scrollContent = container.querySelector('.scroll-area-content');
    expect(scrollContent?.className).toMatch(/\bflex\b/);
    expect(scrollContent?.className).toMatch(/min-h-full/);
  });
});

describe('Specification entry', () => {
  const specification = { id: 'spec-a', key: 'SPEC-A', title: 'Workflow admission hardening' };

  function renderContext(
    value: SessionContextViewModel,
    onOpenSpecification?: (spec: NonNullable<SessionContextViewModel['specification']>) => void,
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

  it('renders a navigational Specification row when the view model carries one and a handler is wired, and opens it with the real specification reference on click', () => {
    const onOpenSpecification = vi.fn();
    renderContext({ status: 'ready', specification }, onOpenSpecification);

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
    renderContext({ status: 'ready', specification });

    expect(screen.queryByText('Specification')).toBeNull();
    expect(screen.queryByText('Workflow admission hardening')).toBeNull();
  });

  it('omits the Specification row when the view model carries no specification reference, even with a handler wired', () => {
    renderContext({ status: 'ready' }, vi.fn());

    expect(screen.queryByText('Specification')).toBeNull();
  });
});
