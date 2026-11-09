// @vitest-environment jsdom
import { useMemo } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TurnSummary, WorkPage, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from './api';
import { createSessionFeed } from './feed';
import { createWorkInspector } from './WorkInspector';
import { availablePaged } from './usePagedHistory';
import { initialPagedState } from './workInspectorStore';

// jsdom never computes real layout, so every element's `scrollTop` would otherwise default to
// (and stay) 0 — indistinguishable from "scrolled to the top". Left alone, that would make the
// auto-load-on-scroll-near-top mount check in WorkInspector.tsx's `useAutoLoadOlder` cascade
// through every page the instant any test with `history.hasOlder: true` opens the Work/Actions
// screen, regardless of what that test is trying to isolate. A real, per-element value — away
// from the near-top threshold by default, exactly like a Turn that opened already showing its
// newest/tail content — lets a test instead explicitly drive "the user is scrolled to/held at the
// top" via `fireEvent.scroll(viewport, { target: { scrollTop: 0 } })`, the same way it would in an
// actually-overflowing browser list.
const ENTRY_HEIGHT = 100;
const scrollTopValues = new WeakMap<HTMLElement, number>();
let originalScrollTop: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    },
  );
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.scrollTo = () => undefined;
  window.scrollTo = () => undefined;

  // jsdom has no layout either, so a scroller's content height is its rendered history entries
  // at `ENTRY_HEIGHT` each: what a page adds to the visible list is what `useAutoLoadOlder`
  // measures. Entries a filter hides, or that collapse into one burst row, are not rendered as
  // separate entries and add nothing.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.querySelectorAll('[data-history-entry]').length * ENTRY_HEIGHT;
    },
  });
  originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTopValues.get(this) ?? 1000;
    },
    set(this: HTMLElement, value: number) {
      scrollTopValues.set(this, value);
    },
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  vi.unstubAllGlobals();
  if (originalScrollTop) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', originalScrollTop);
  }
});

const sessionId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const turn: TurnSummary = {
  turnId,
  state: 'active',
  revision: 1,
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
  userMessage: { text: 'Investigate the failure', complete: true },
};

let seq = 0;
function work(overrides: Partial<WorkSummary> & { kind: WorkSummary['kind'] }): WorkSummary {
  seq += 1;

  return {
    workId: `work-${seq}`,
    ordinal: seq,
    revision: 1,
    state: 'completed',
    title: { text: overrides.kind + ' ' + seq, complete: true },
    createdAt: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    ...overrides,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks.length ? chunks : [[]];
}

/** A deterministic, bounded-paging `work()` mock: ascending `items` split into `pageSize` pages.
 * `before=undefined` returns the newest (last) page first, exactly like the real tail-window
 * contract; `calls` records every `before` cursor requested, so a test can assert the initial
 * mount fetches exactly one bounded page instead of eagerly walking the whole history. */
function fixtureApi(items: readonly WorkSummary[], pageSize = 40) {
  const pages = chunk(items, pageSize);
  const calls: (string | undefined)[] = [];
  const api: Pick<ManagedSessionsApi, 'work' | 'actions'> = {
    work: (_sessionId, _turnId, before) => {
      calls.push(before);
      const index = before === undefined ? pages.length - 1 : Number(before);
      const pageItems = pages[index] ?? [];
      const hasOlder = index > 0;

      return Promise.resolve({
        sessionId,
        eventSeq: 1,
        turn,
        items: pageItems,
        history: { hasOlder, before: hasOlder ? String(index - 1) : undefined },
      } satisfies WorkPage);
    },
    actions: () =>
      Promise.resolve({
        sessionId,
        eventSeq: 1,
        workId: 'work-0',
        items: [],
        history: { hasOlder: false },
      }),
  };

  return { api: api as unknown as ManagedSessionsApi, calls };
}

function Host({ api }: { api: ManagedSessionsApi }) {
  const feed = useMemo(() => createSessionFeed(api, sessionId, 'work-test'), [api]);
  const workStack = useMemo(() => createWorkInspector(api, feed, 'work-test'), [api, feed]);
  const navigation = useSecondaryNavigation();

  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        <button
          type="button"
          onClick={() => void navigation.open(workStack, { sessionId, turnId })}
        >
          Open Work
        </button>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

async function openWork(api: ManagedSessionsApi) {
  render(
    <StoryLocalization locale="en">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppWorkspaceProvider>
          <AppShell navigation={<div>Nav</div>}>
            <Host api={api} />
          </AppShell>
        </AppWorkspaceProvider>
      </QueryClientProvider>
    </StoryLocalization>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText('Open Work'));
    await Promise.resolve();
  });
}

/** This test environment's stubbed `ResizeObserver` never reports a measured width, so
 * `AppWorkspace` always renders through its mobile "stacked" runtime here — which wraps the
 * Secondary panel in its own outer `ScrollArea` (`mobile-workspace-scroll-area`) in addition to
 * `WorkInspector.tsx`'s own inner one, so more than one `.scroll-area-viewport` exists in the DOM.
 * Resolving from an element already known to be inside the Work list's own scroller (rather than
 * `document.querySelector('.scroll-area-viewport')`, which would silently grab the outer one and
 * never trigger `WorkInspector.tsx`'s `maybeLoadOlder`) reaches the right one regardless. */
function workScroller(withinNode: Element): HTMLElement {
  const viewport = withinNode.closest<HTMLElement>('.scroll-area-viewport');
  if (!viewport) {
    throw new Error('Expected the Work scroller viewport to be mounted.');
  }

  return viewport;
}

function clickTrigger(label: string) {
  const trigger = screen.getByText(label).closest('button');
  if (!trigger) {
    throw new Error(`Expected "${label}" to be inside a trigger button.`);
  }

  fireEvent.click(trigger);
}

/** The type filter is an icon-only `IconButton` opening a `Menu` (never a `SegmentedControl`,
 * never a text-label `Button` either — see WorkInspector.tsx's WorkFilterBar): its trigger only
 * opens on Enter/Space or a pointer press, never a plain click event, matching the real
 * `@radix-ui/react-dropdown-menu` Trigger contract. `currentLabel` is the trigger's accessible
 * name (`aria-label`), not visible text — the trigger shows only the filter glyph. */
function selectFilterKind(currentLabel: string, kindLabel: string) {
  const trigger = screen.getByRole('button', { name: currentLabel });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitemradio', { name: kindLabel }));
}

describe('WorkInspector Work screen', () => {
  it('groups operations under their Commentary, defaulting leading operations to Start of Turn', async () => {
    const leading = work({
      title: { text: 'Read file admission.mjs', complete: true },
      kind: 'tool',
    });
    const commentary = work({
      kind: 'commentary',
      title: { text: 'Checking the recovery branch…', complete: true },
    });
    const reasoning = work({
      kind: 'reasoning',
      title: { text: 'Weighing two fixes', complete: true },
    });
    const trailing = work({
      title: { text: 'Run command pnpm test', complete: true },
      kind: 'tool',
    });
    const { api } = fixtureApi([leading, commentary, reasoning, trailing]);

    await openWork(api);

    await screen.findByText('Start of Turn');
    expect(screen.getByText('Read file admission.mjs')).toBeTruthy();
    expect(screen.getByText('Checking the recovery branch…')).toBeTruthy();
    expect(screen.getByText('Thinking')).toBeTruthy();
    expect(screen.getByText('Run command pnpm test')).toBeTruthy();
  });

  it('reads an ordinary Commentary directly, with no chevron and no "Show more" control', async () => {
    const commentary = work({
      kind: 'commentary',
      title: { text: 'Checking the recovery branch…', complete: true },
    });
    const { api } = fixtureApi([commentary]);

    await openWork(api);
    await screen.findByText('Checking the recovery branch…');

    // The text itself is never a button/trigger — it is plain, always-visible content, not a
    // disclosure (live owner review #2, structural pass, rule 1).
    expect(screen.getByText('Checking the recovery branch…').closest('button')).toBeNull();
    expect(screen.queryByText('Show more')).toBeNull();
  });

  it('truncates a genuinely long Commentary behind "Show more", expanding to the full text', async () => {
    const longText = 'Investigating the admission failure. '.repeat(10); // > 280 chars
    const commentary = work({
      kind: 'commentary',
      title: { text: longText, complete: true },
    });
    const { api } = fixtureApi([commentary]);

    await openWork(api);
    const trigger = await screen.findByText('Show more');

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByText('Show less')).toBeTruthy());
  });

  it('renders Reasoning as narration like Commentary — visible without a click, told apart only by italic voice', async () => {
    const commentary = work({
      kind: 'commentary',
      title: { text: 'Checking options…', complete: true },
    });
    const reasoning = work({
      kind: 'reasoning',
      title: { text: 'The simpler fix risks a regression', complete: true },
    });
    const { api } = fixtureApi([commentary, reasoning]);

    await openWork(api);
    const thought = await screen.findByText('The simpler fix risks a regression');
    const said = screen.getByText('Checking options…');
    // No disclosure: the text is shown directly, not behind a "Thinking" trigger.
    expect(thought.closest('button')).toBeNull();
    // Same narration block, different voice: italic for Thinking only.
    expect(thought.closest('.italic')).not.toBeNull();
    expect(said.closest('.italic')).toBeNull();
    // Never a row on the operations rail.
    expect(thought.closest('ol')).toBeNull();
    // Assistive tech still gets the kind's own name, since italics are not announced.
    expect(thought.parentElement?.textContent).toContain('Thinking');
  });

  it('a type filter narrows to exactly one kind, with no Commentary mixed in (owner review, round three)', async () => {
    const commentary = work({
      kind: 'commentary',
      title: { text: 'Checking options…', complete: true },
    });
    const reasoning = work({
      kind: 'reasoning',
      title: { text: 'Weighing two fixes', complete: true },
    });
    const tool = work({ kind: 'tool', title: { text: 'Run command pnpm test', complete: true } });
    const { api } = fixtureApi([commentary, reasoning, tool]);

    await openWork(api);
    await screen.findByText('Checking options…');
    expect(screen.getByText('Thinking')).toBeTruthy();

    selectFilterKind('Filter Work by type', 'Tool');
    await waitFor(() => expect(screen.queryByText('Thinking')).toBeNull());
    // Commentary is not part of the "Tool" filter's own result, so it is not shown either —
    // every option shows only the kind it names, nothing mixed in (owner: "Commentary to nie
    // kontekst chyba?").
    expect(screen.queryByText('Checking options…')).toBeNull();
    expect(screen.getByText('Run command pnpm test')).toBeTruthy();
  });

  it('search matches a tool title and keeps it in its chapter, without surfacing a non-matching Commentary', async () => {
    const leading = work({
      title: { text: 'Read file unrelated.mjs', complete: true },
      kind: 'tool',
    });
    const commentary = work({
      kind: 'commentary',
      title: { text: 'Checking recovery…', complete: true },
    });
    const target = work({ title: { text: 'Run command pnpm test', complete: true }, kind: 'tool' });
    const { api } = fixtureApi([leading, commentary, target]);

    await openWork(api);
    await screen.findByText('Start of Turn');

    const search = screen.getByPlaceholderText('Search Work');
    fireEvent.change(search, { target: { value: 'pnpm' } });

    await waitFor(() => expect(screen.queryByText('Start of Turn')).toBeNull());
    // The Commentary itself doesn't match "pnpm", so (owner review, round three) it isn't shown
    // either — only the matching tool row.
    expect(screen.queryByText('Checking recovery…')).toBeNull();
    expect(screen.getByText('Run command pnpm test')).toBeTruthy();
    expect(screen.queryByText('Read file unrelated.mjs')).toBeNull();
  });

  function ninetyPhaseItems(): WorkSummary[] {
    // 90 Commentary/tool pairs = 180 items; 40 per page -> 5 pages (the V10 mock's
    // synthetic-scalability scenario, here with a bounded real page size).
    const items: WorkSummary[] = [];
    for (let index = 0; index < 90; index += 1) {
      items.push(
        work({ kind: 'commentary', title: { text: `Phase ${index}…`, complete: true } }),
        work({ kind: 'tool', title: { text: `Run step ${index}`, complete: true } }),
      );
    }

    return items;
  }

  it('fetches only one bounded tail page up front, then auto-loads older pages on scroll near the top until there is nothing left, then stops', async () => {
    const { api, calls } = fixtureApi(ninetyPhaseItems(), 40);

    await openWork(api);
    // The tail page (phases 80-89) is visible...
    const tail = await screen.findByText('Phase 85…');
    // ...but nothing from an older, not-yet-fetched page has been rendered.
    expect(screen.queryByText('Phase 70…')).toBeNull();
    // Only the newest (tail) page was requested — not an eager walk of the whole 180-item history
    // (the scroller opened away from the near-top threshold, the realistic default for a Turn that
    // opened showing its newest/tail content — see the file-level `scrollTop` stub above).
    expect(calls).toEqual([undefined]);

    // Scrolling the Work list to, and staying at, its top edge — replacing the old manual "Load
    // older Work" button — keeps loading further pages automatically: each merge re-triggers
    // `maybeLoadOlder` (`WorkInspector.tsx`'s `useAutoLoadOlder`) without the user scrolling again,
    // until the oldest page (`history.hasOlder: false`) is reached.
    const viewport = workScroller(tail);
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    // A generous timeout: this cascades through four sequential fetch-then-merge round trips
    // (each its own React commit), which can run well past the default 1000ms under a loaded,
    // highly parallel full-suite run even though every fixture promise resolves immediately.
    await screen.findByText('Phase 0…', {}, { timeout: 5000 });
    expect(calls).toEqual([undefined, '3', '2', '1', '0']);
    // The already-rendered tail (and every page merged along the way) survives — it is never
    // discarded or refetched.
    expect(screen.getByText('Phase 85…')).toBeTruthy();
    expect(screen.getByText('Phase 40…')).toBeTruthy();

    // Once exhausted, a further "near the top" scroll requests nothing more.
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    await Promise.resolve();
    expect(calls).toEqual([undefined, '3', '2', '1', '0']);
  });
});

describe('WorkInspector start of Turn', () => {
  it('labels the leading chapter "Start of Turn" only once the oldest page is loaded', async () => {
    const tool = (text: string) => work({ kind: 'tool', title: { text, complete: true } });
    // Pages of two: [A, B] (the real start) · [Phase, C] · [D]. The tail's chapter has no
    // Commentary loaded only because its Commentary is on an older page, not because it is the
    // start of the Turn.
    const { api, calls } = fixtureApi(
      [
        tool('Run A'),
        tool('Run B'),
        work({ kind: 'commentary', title: { text: 'Phase one…', complete: true } }),
        tool('Run C'),
        tool('Run D'),
      ],
      2,
    );
    const startOfTurn = /Start of Turn|Początek tury/;

    await openWork(api);
    const tail = await screen.findByText('Run D');
    expect(screen.queryByText(startOfTurn)).toBeNull();

    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    await screen.findByText('Run A', {}, { timeout: 5000 });
    expect(calls).toEqual([undefined, '1', '0']);
    expect(screen.getAllByText(startOfTurn)).toHaveLength(1);
  });
});

describe('WorkInspector sparse-state framing', () => {
  it('frames an empty Turn as a deliberate, full-height-centred EmptyState, not a bare top-pinned line', async () => {
    const { api } = fixtureApi([]);

    const { container } = render(
      <StoryLocalization locale="en">
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AppWorkspaceProvider>
            <AppShell navigation={<div>Nav</div>}>
              <Host api={api} />
            </AppShell>
          </AppWorkspaceProvider>
        </QueryClientProvider>
      </StoryLocalization>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Open Work'));
      await Promise.resolve();
    });
    await screen.findByText('No Work yet for this Turn.');

    const empty = container.querySelector('[data-empty-state="pane"]');
    expect(empty).toBeTruthy();
    // The scrolled content must be a definite-height flex column, otherwise `EmptyState`'s own
    // `flex-1 min-h-full ... justify-center` has nothing to fill/centre within and silently
    // collapses to the top of an otherwise-blank, full-viewport mobile drill-in panel
    // (live-review finding).
    const scrollContent = empty?.closest('.scroll-area-content');
    expect(scrollContent?.className).toMatch(/\bflex\b/);
    expect(scrollContent?.className).toMatch(/min-h-full/);
  });

  // Confirmed desktop live-review bug: an `m-auto` wrapper centred a short Work log vertically,
  // leaving a large blank gap between the filter bar and the log. Lists start at the top.
  it('anchors a short (one-item) visible Work log directly under the filter bar instead of vertically centring it', async () => {
    const lone = work({ kind: 'tool', title: { text: 'Run a single step', complete: true } });
    const { api } = fixtureApi([lone]);

    render(
      <StoryLocalization locale="en">
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AppWorkspaceProvider>
            <AppShell navigation={<div>Nav</div>}>
              <Host api={api} />
            </AppShell>
          </AppWorkspaceProvider>
        </QueryClientProvider>
      </StoryLocalization>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Open Work'));
      await Promise.resolve();
    });

    const row = await screen.findByText('Run a single step');
    expect(row.closest('.m-auto')).toBeNull();
  });

  it('anchors a short (one-action) drill-in at the top of the panel instead of vertically centring it', async () => {
    const tool = work({
      kind: 'tool',
      title: { text: 'Run a single step', complete: true },
      actionCount: 1,
    });
    const { api: workApi } = fixtureApi([tool]);
    const api: ManagedSessionsApi = {
      ...workApi,
      actions: () =>
        Promise.resolve({
          sessionId,
          eventSeq: 1,
          workId: tool.workId,
          items: [
            {
              actionId: 'action-1',
              ordinal: 1,
              revision: 1,
              state: 'completed',
              title: { text: 'Read one file', complete: true },
              createdAt: '2026-10-30T10:00:00Z',
              updatedAt: '2026-10-30T10:00:00Z',
            },
          ],
          history: { hasOlder: false },
        }),
    };

    render(
      <StoryLocalization locale="en">
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AppWorkspaceProvider>
            <AppShell navigation={<div>Nav</div>}>
              <Host api={api} />
            </AppShell>
          </AppWorkspaceProvider>
        </QueryClientProvider>
      </StoryLocalization>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Open Work'));
      await Promise.resolve();
    });
    await screen.findByText('Run a single step');
    // The operation's own title is the way into its ToolAction details.
    clickTrigger('Run a single step');

    const action = await screen.findByText('Read one file');
    expect(action.closest('.m-auto')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// View state kept across Secondary tab switches, the older-page cursor, the scroll anchor and the
// counts (PR #112 review F05-F10). The Work view is product state of the Turn's tab
// (secondary-navigation.md "Selection, filters, drafts and expanded rows are product state, kept
// outside the screen… scoped to the tab's object"); an inactive tab unmounts by design.
// ---------------------------------------------------------------------------------------------

const otherTurnId = '00000000-0000-4000-8000-000000000003';
const countsOf = (total: number) => ({
  total,
  inProgress: 0,
  byKind: { tool: total, commentary: 0, reasoning: 0, interaction: 0 },
});

interface PagedApiOptions {
  /** Pages per Turn, ascending; the last one is the tail window. */
  turns: Record<string, WorkSummary[][]>;
  /** Counts a page reports, by whether it is the tail window. */
  countsFor?: (source: 'tail' | 'older') => { eventSeq: number; total: number } | undefined;
  /** An older `before` whose first request is held until `release()` (a slow older load). */
  hold?: string;
  /** An older `before` whose first request fails. */
  failOnce?: string;
}

function pagedApi(options: PagedApiOptions) {
  const calls: { turnId: string; before: string | undefined }[] = [];
  let tailCalls = 0;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let heldUsed = false;
  let failed = false;
  let down = false;
  const api = {
    work: async (_sessionId: string, forTurn: string, before?: string) => {
      calls.push({ turnId: forTurn, before });
      if (down && before === undefined) {
        throw new Error('API unavailable');
      }

      const pages = options.turns[forTurn] ?? [[]];
      const index = before === undefined ? pages.length - 1 : Number(before);
      if (before !== undefined && before === options.hold && !heldUsed) {
        heldUsed = true;
        await held;
      }

      if (before !== undefined && before === options.failOnce && !failed) {
        failed = true;

        throw new Error('older page failed');
      }

      const source = before === undefined ? 'tail' : 'older';
      if (source === 'tail') {
        tailCalls += 1;
      }

      const reported = options.countsFor?.(source);
      const hasOlder = index > 0;

      return {
        sessionId,
        // Every tail request describes a newer snapshot, so a refresh always yields new data.
        eventSeq: reported?.eventSeq ?? (source === 'tail' ? 100 + tailCalls : 1),
        turn,
        items: pages[index] ?? [],
        history: { hasOlder, before: hasOlder ? String(index - 1) : undefined },
        ...(reported ? { counts: countsOf(reported.total) } : {}),
      } satisfies WorkPage;
    },
    actions: () =>
      Promise.resolve({
        sessionId,
        eventSeq: 1,
        workId: 'work-0',
        items: [],
        history: { hasOlder: false },
      }),
  } as unknown as ManagedSessionsApi;

  return { api, calls, release: () => release(), setDown: (value: boolean) => (down = value) };
}

function TurnsHost({ api, pinned = false }: { api: ManagedSessionsApi; pinned?: boolean }) {
  const feed = useMemo(() => createSessionFeed(api, sessionId, 'work-test'), [api]);
  const workStack = useMemo(() => createWorkInspector(api, feed, 'work-test'), [api, feed]);
  const navigation = useSecondaryNavigation();
  // A pinned tab makes the Secondary a split with root tabs: the workspace then hosts the detail header.
  useRegisterPinnedSecondaryTab(pinned ? { title: 'Context' } : null);

  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
        {[turnId, otherTurnId].map((id, index) => (
          <button
            key={id}
            type="button"
            onClick={() => void navigation.openTab(workStack, { sessionId, turnId: id })}
          >
            {`Open Turn ${index + 1}`}
          </button>
        ))}
      </AppWorkspace.Primary>
      {pinned ? (
        <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
          <div>Pinned context content</div>
        </AppWorkspace.Secondary>
      ) : null}
    </AppWorkspace>
  );
}

function mountTurns(api: ManagedSessionsApi, options: { pinned?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <StoryLocalization locale="en">
      <QueryClientProvider client={client}>
        <AppWorkspaceProvider>
          <AppShell navigation={<div>Nav</div>}>
            <TurnsHost api={api} pinned={options.pinned} />
          </AppShell>
        </AppWorkspaceProvider>
      </QueryClientProvider>
    </StoryLocalization>,
  );

  return client;
}

async function openTurn(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(label));
    await Promise.resolve();
  });
}

/** The tail refresh a Work-change notification triggers, without the debounce timer. */
async function refreshTail(client: QueryClient) {
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['managed-work'] });
    // Let the query observers deliver the refreshed data to the screen before returning.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function toolItems(prefix: string, count: number): WorkSummary[] {
  return Array.from({ length: count }, (_, index) =>
    work({ kind: 'tool', title: { text: `${prefix} ${index}`, complete: true } }),
  );
}

function longNarration(): WorkSummary {
  return work({
    kind: 'commentary',
    title: { text: 'Long narration. '.repeat(30), complete: true },
  });
}

describe('WorkInspector view state', () => {
  it('F05: a tail refresh does not rewind the older-page cursor (Retry continues where it failed)', async () => {
    const pages = [
      toolItems('Page0', 2),
      toolItems('Page1', 2),
      toolItems('Page2', 2),
      toolItems('Tail', 2),
    ];
    const { api, calls } = pagedApi({ turns: { [turnId]: pages }, failOnce: '1' });
    const client = mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Tail 0');

    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    // '2' loads, then '1' fails and the auto-load stops on the error.
    await screen.findByRole('button', { name: 'Retry' }, { timeout: 5000 });
    expect(calls.map((call) => call.before)).toEqual([undefined, '2', '1']);

    await refreshTail(client);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText('Page1 0');

    // Continues with the failed page; a rewound cursor would request page '2' a second time.
    const older = calls.map((call) => call.before).filter((before) => before !== undefined);
    expect(older.slice(0, 3)).toEqual(['2', '1', '1']);
  });

  it('F06/F07: loaded older pages, filter, search and expanded narration come back for the same Turn after a tab switch', async () => {
    const pages = [[longNarration(), ...toolItems('Old', 2)], toolItems('Tail', 2)];
    const { api, calls } = pagedApi({
      turns: { [turnId]: pages, [otherTurnId]: [toolItems('Elsewhere', 1)] },
    });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Tail 0');
    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    await screen.findByText('Old 0', {}, { timeout: 5000 });
    fireEvent.click(await screen.findByText('Show more'));
    await screen.findByText('Show less');
    selectFilterKind('Filter Work by type', 'Tool');
    fireEvent.change(screen.getByPlaceholderText('Search Work'), { target: { value: 'Old' } });
    await waitFor(() => expect(screen.queryByText('Tail 0')).toBeNull());

    // Another Turn's tab replaces this one (inactive tabs unmount).
    await openTurn('Open Turn 2');
    await screen.findByText('Elsewhere 0');
    expect(screen.queryByText('Old 0')).toBeNull();
    const callsBefore = calls.length;

    await openTurn('Open Turn 1');
    // The same view: older page merged, filter and search kept, no older refetch.
    expect(await screen.findByText('Old 0')).toBeTruthy();
    expect(screen.getByPlaceholderText<HTMLInputElement>('Search Work').value).toBe('Old');
    expect(
      screen.getByRole('button', { name: 'Filter Work by type (active filter: Tool)' }),
    ).toBeTruthy();
    expect(calls.slice(callsBefore).filter((call) => call.before !== undefined)).toEqual([]);
  });

  it('F07: expanded narration survives a tab switch', async () => {
    const { api } = pagedApi({
      turns: { [turnId]: [[longNarration()]], [otherTurnId]: [toolItems('Elsewhere', 1)] },
    });
    mountTurns(api);
    await openTurn('Open Turn 1');
    fireEvent.click(await screen.findByText('Show more'));
    await screen.findByText('Show less');

    await openTurn('Open Turn 2');
    await screen.findByText('Elsewhere 0');
    await openTurn('Open Turn 1');

    expect(await screen.findByText('Show less')).toBeTruthy();
  });

  it('F09: a tail refresh landing during an older load does not use up the scroll anchor', async () => {
    // jsdom lays nothing out: every history entry is given a 300px row in its scroller, in
    // document order, moved by the scroller's `scrollTop` (`pagedHistoryAnchor.ts` measures these).
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const scroller = this.closest<HTMLElement>('.scroll-area-viewport');
        const entries = scroller ? [...scroller.querySelectorAll('[data-history-entry]')] : [];
        const index = entries.indexOf(this);
        const top = index < 0 ? 0 : index * 300 - scroller!.scrollTop;
        const height = index < 0 ? 0 : 300;

        return { top, bottom: top + height, height } as DOMRect;
      });
    try {
      const pages = [toolItems('Old', 2), toolItems('Tail', 2)];
      const { api, release } = pagedApi({ turns: { [turnId]: pages }, hold: '0' });
      const client = mountTurns(api);
      await openTurn('Open Turn 1');
      const tail = await screen.findByText('Tail 0');
      const viewport = workScroller(tail);

      fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
      await screen.findByText('Loading older Work…');
      await refreshTail(client);

      await act(async () => {
        release();
        await Promise.resolve();
      });
      await screen.findByText('Old 0');

      // 0 + the 600px the older page added above the viewport.
      expect(viewport.scrollTop).toBe(600);
    } finally {
      rects.mockRestore();
    }
  });

  it('F10: counts from an older page never overwrite the newer tail counts', async () => {
    const pages = [toolItems('Old', 2), toolItems('Tail', 2)];
    const { api } = pagedApi({
      turns: { [turnId]: pages },
      countsFor: (source) =>
        source === 'tail' ? { eventSeq: 50, total: 40 } : { eventSeq: 10, total: 7 },
    });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Tail 0');
    await screen.findByText('40 work items');

    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    await screen.findByText('Old 0');

    expect(screen.getByText('40 work items')).toBeTruthy();
    expect(screen.queryByText('7 work items')).toBeNull();
  });

  it('hides the counts row for a Turn whose WorkPage carries no counts', async () => {
    const pages = [toolItems('Tail', 2)];
    const { api } = pagedApi({ turns: { [turnId]: pages } });
    mountTurns(api);
    await openTurn('Open Turn 1');
    await screen.findByText('Tail 0');

    // Never derived from the loaded items: two are loaded, yet no "2 work items" row appears.
    expect(screen.queryByText(/\d+ work items?/)).toBeNull();
  });
});

describe('WorkInspector Actions view state', () => {
  it('keeps loaded older ToolAction pages when the tab is switched away and back', async () => {
    const tool = work({
      kind: 'tool',
      title: { text: 'Run a batch', complete: true },
      actionCount: 4,
    });
    const action = (ordinal: number) => ({
      actionId: `action-${ordinal}`,
      ordinal,
      revision: 1,
      state: 'completed' as const,
      title: { text: `Action ${ordinal}`, complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
    });
    const actionPages = [
      [action(1), action(2)],
      [action(3), action(4)],
    ];
    const actionCalls: (string | undefined)[] = [];
    const { api: workApi } = pagedApi({
      turns: { [turnId]: [[tool]], [otherTurnId]: [toolItems('Elsewhere', 1)] },
    });
    const api = {
      ...workApi,
      actions: (_sessionId: string, workId: string, before?: string) => {
        actionCalls.push(before);
        const index = before === undefined ? 1 : Number(before);

        return Promise.resolve({
          sessionId,
          eventSeq: 1,
          workId,
          items: actionPages[index],
          history: { hasOlder: index > 0, before: index > 0 ? String(index - 1) : undefined },
        });
      },
    } as unknown as ManagedSessionsApi;
    mountTurns(api);
    await openTurn('Open Turn 1');
    fireEvent.click((await screen.findByText('Run a batch')).closest('button')!);
    const newest = await screen.findByText('Action 3');
    fireEvent.scroll(workScroller(newest), { target: { scrollTop: 0 } });
    await screen.findByText('Action 1', {}, { timeout: 5000 });

    await openTurn('Open Turn 2');
    await screen.findByText('Elsewhere 0');
    const before = actionCalls.length;
    await openTurn('Open Turn 1');

    expect(await screen.findByText('Action 1')).toBeTruthy();
    expect(actionCalls.slice(before).filter((cursor) => cursor !== undefined)).toEqual([]);
  });
});

describe('WorkInspector failed tail refresh keeps loaded history', () => {
  const refreshFailed = 'Could not refresh. What is shown may be out of date.';

  it('N04: a failed tail refetch keeps the loaded Work visible with a refresh-failure notice', async () => {
    const { api, setDown } = pagedApi({
      turns: { [turnId]: [toolItems('Old', 2), toolItems('Tail', 2)] },
    });
    const client = mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Tail 0');
    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    await screen.findByText('Old 0');

    setDown(true);
    await refreshTail(client);

    expect(await screen.findByText(refreshFailed)).toBeTruthy();
    expect(screen.getByText('Old 0')).toBeTruthy();
    expect(screen.getByText('Tail 0')).toBeTruthy();
    expect(screen.queryByText('Could not load this part of the session.')).toBeNull();

    // Retry recovers and clears the notice.
    setDown(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText(refreshFailed)).toBeNull());
    expect(screen.getByText('Old 0')).toBeTruthy();
  });

  it('N04: returning to a Turn after the query cache is gone and the API is down shows the stored history, filter and search', async () => {
    const { api, setDown } = pagedApi({
      turns: {
        [turnId]: [toolItems('Old', 2), toolItems('Tail', 2)],
        [otherTurnId]: [toolItems('Elsewhere', 1)],
      },
    });
    const client = mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Tail 0');
    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });
    await screen.findByText('Old 0');
    selectFilterKind('Filter Work by type', 'Tool');
    fireEvent.change(screen.getByPlaceholderText('Search Work'), { target: { value: 'Old' } });
    await waitFor(() => expect(screen.queryByText('Tail 0')).toBeNull());

    await openTurn('Open Turn 2');
    await screen.findByText('Elsewhere 0');
    client.clear();
    setDown(true);
    await openTurn('Open Turn 1');

    expect(await screen.findByText(refreshFailed)).toBeTruthy();
    expect(screen.getByText('Old 0')).toBeTruthy();
    expect(screen.getByPlaceholderText<HTMLInputElement>('Search Work').value).toBe('Old');
  });

  it('N04: a never-loaded Turn whose first load fails still shows the full error state', async () => {
    const { api, setDown } = pagedApi({ turns: { [turnId]: [toolItems('Tail', 1)] } });
    setDown(true);
    mountTurns(api);
    await openTurn('Open Turn 1');

    expect(await screen.findByText('Could not load this part of the session.')).toBeTruthy();
    expect(screen.queryByText(refreshFailed)).toBeNull();
  });

  it('N04: the Actions screen keeps loaded ToolActions visible when its refresh fails', async () => {
    const tool = work({
      kind: 'tool',
      title: { text: 'Run a batch', complete: true },
      actionCount: 2,
    });
    const action = (ordinal: number) => ({
      actionId: `action-${ordinal}`,
      ordinal,
      revision: 1,
      state: 'completed' as const,
      title: { text: `Action ${ordinal}`, complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
    });
    let down = false;
    const { api: workApi } = pagedApi({
      turns: { [turnId]: [[tool]], [otherTurnId]: [toolItems('Elsewhere', 1)] },
    });
    const api = {
      ...workApi,
      actions: (_sessionId: string, workId: string) => {
        if (down) {
          return Promise.reject(new Error('API unavailable'));
        }

        return Promise.resolve({
          sessionId,
          eventSeq: 1,
          workId,
          items: [action(1), action(2)],
          history: { hasOlder: false },
        });
      },
    } as unknown as ManagedSessionsApi;
    const client = mountTurns(api);
    await openTurn('Open Turn 1');
    fireEvent.click((await screen.findByText('Run a batch')).closest('button')!);
    await screen.findByText('Action 1');

    down = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['managed-actions'] });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(await screen.findByText(refreshFailed)).toBeTruthy();
    expect(screen.getByText('Action 1')).toBeTruthy();
    expect(screen.getByText('Action 2')).toBeTruthy();
  });

  it('N07: the detail header keeps naming the Work while the retained actions are shown after a cache loss and a failed refetch', async () => {
    const tool = work({
      kind: 'tool',
      title: { text: 'Run a batch', complete: true },
      actionCount: 2,
    });
    const action = (ordinal: number) => ({
      actionId: `action-${ordinal}`,
      ordinal,
      revision: 1,
      state: 'completed' as const,
      title: { text: `Action ${ordinal}`, complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
    });
    let down = false;
    const { api: workApi } = pagedApi({
      turns: { [turnId]: [[tool]], [otherTurnId]: [toolItems('Elsewhere', 1)] },
    });
    const api = {
      ...workApi,
      actions: (_sessionId: string, workId: string) =>
        down
          ? Promise.reject(new Error('API unavailable'))
          : Promise.resolve({
              sessionId,
              eventSeq: 1,
              workId,
              items: [action(1), action(2)],
              history: { hasOlder: false },
            }),
    } as unknown as ManagedSessionsApi;
    // A split-capable width, so the Secondary is a split with root tabs and hosts the detail header.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1400,
      height: 56,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    });
    const client = mountTurns(api, { pinned: true });
    await openTurn('Open Turn 1');
    fireEvent.click((await screen.findByText('Run a batch')).closest('button')!);
    await screen.findByText('Action 1');
    const headings = () => screen.queryAllByRole('heading', { level: 2, name: 'Run a batch' });
    const shownBefore = headings().length;
    expect(shownBefore).toBe(1);

    await openTurn('Open Turn 2');
    await screen.findByText('Elsewhere 0');
    client.clear();
    down = true;
    await openTurn('Open Turn 1');

    expect(await screen.findByText(refreshFailed)).toBeTruthy();
    expect(screen.getByText('Action 1')).toBeTruthy();
    expect(headings()).toHaveLength(shownBefore);
    rect.mockRestore();
  });
});

describe('availablePaged', () => {
  const merge = (stored: readonly string[], tail: readonly string[]) => [
    ...new Set([...stored, ...tail]),
  ];

  it('N07: the stored pages and their cursor stay available when the tail window is gone', () => {
    const stored = {
      ...initialPagedState<string>(),
      items: ['a'],
      cursor: { hasOlder: true, before: 'x' },
    };

    expect(availablePaged(stored, undefined, merge)).toEqual({ items: ['a'], hasOlder: true });
    expect(
      availablePaged(
        initialPagedState<string>(),
        { items: ['b'], history: { hasOlder: true } },
        merge,
      ),
    ).toEqual({ items: ['b'], hasOlder: true });
  });
});

describe('WorkInspector bounded auto-loading of older history', () => {
  // Pages of two items: 100 pages of history behind the tail, none of them showing anything.
  const pageCount = 100;
  const older = (calls: { before?: string }[]) =>
    calls.filter((call) => call.before !== undefined).length;

  it('N09: a search with no match in the loaded part stops after three pages and offers to search on', async () => {
    const pages = Array.from({ length: pageCount }, (_, index) => toolItems(`Page${index}`, 2));
    const { api, calls } = pagedApi({ turns: { [turnId]: pages } });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText(`Page${pageCount - 1} 0`);
    const viewport = workScroller(tail);

    fireEvent.change(screen.getByPlaceholderText('Search Work'), { target: { value: 'zzz' } });
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    const button = await screen.findByRole('button', { name: 'Search older history' });
    // Not a definitive "no matches" while older history remains unread.
    expect(screen.getByText('No Work matches these filters in the loaded entries.')).toBeTruthy();
    expect(screen.queryByText('No Work matches these filters.')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(older(calls)).toBe(3);

    // A click loads the next batch, under the same bound.
    fireEvent.click(button);
    await waitFor(() => expect(older(calls)).toBe(6));
    await screen.findByRole('button', { name: 'Search older history' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(older(calls)).toBe(6);
  });

  it('N09: a changed search and an upward scroll gesture start looking again', async () => {
    const pages = Array.from({ length: pageCount }, (_, index) => toolItems(`Page${index}`, 2));
    const { api, calls } = pagedApi({ turns: { [turnId]: pages } });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText(`Page${pageCount - 1} 0`);
    const viewport = workScroller(tail);

    const search = screen.getByPlaceholderText('Search Work');
    fireEvent.change(search, { target: { value: 'zzz' } });
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    await screen.findByRole('button', { name: 'Search older history' });
    expect(older(calls)).toBe(3);

    fireEvent.wheel(viewport, { deltaY: -40 });
    await waitFor(() => expect(older(calls)).toBe(6));
    await screen.findByRole('button', { name: 'Search older history' });

    fireEvent.change(search, { target: { value: 'zzzz' } });
    await waitFor(() => expect(older(calls)).toBe(9));
    await screen.findByRole('button', { name: 'Search older history' });
  });

  it('N09: long runs of completed tools that collapse into one burst row stop the loading without a filter', async () => {
    // Ten completed tools per page: one burst row however many pages are merged.
    const pages = Array.from({ length: pageCount }, (_, index) => toolItems(`Page${index}`, 10));
    const { api, calls } = pagedApi({ turns: { [turnId]: pages } });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const burst = await screen.findByText('10 tool actions');
    fireEvent.scroll(workScroller(burst), { target: { scrollTop: 0 } });

    const button = await screen.findByRole('button', { name: 'Load older history' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(older(calls)).toBe(3);

    fireEvent.click(button);
    await waitFor(() => expect(older(calls)).toBe(6));
    await screen.findByRole('button', { name: 'Load older history' });
  });

  it('N09: the Actions screen stops the same way when older pages add no action', async () => {
    const tool = work({
      kind: 'tool',
      title: { text: 'Run a batch', complete: true },
      actionCount: 4,
    });
    const action = (ordinal: number) => ({
      actionId: `action-${ordinal}`,
      ordinal,
      revision: 1,
      state: 'completed' as const,
      title: { text: `Action ${ordinal}`, complete: true },
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
    });
    const actionCalls: (string | undefined)[] = [];
    const { api: workApi } = pagedApi({ turns: { [turnId]: [[tool]] } });
    const api = {
      ...workApi,
      actions: (_sessionId: string, workId: string, before?: string) => {
        actionCalls.push(before);
        const index = before === undefined ? pageCount : Number(before);

        return Promise.resolve({
          sessionId,
          eventSeq: 1,
          workId,
          items: before === undefined ? [action(1), action(2)] : [],
          history: { hasOlder: index > 0, before: index > 0 ? String(index - 1) : undefined },
        });
      },
    } as unknown as ManagedSessionsApi;
    mountTurns(api);
    await openTurn('Open Turn 1');
    fireEvent.click((await screen.findByText('Run a batch')).closest('button')!);
    const newest = await screen.findByText('Action 2');
    fireEvent.scroll(workScroller(newest), { target: { scrollTop: 0 } });

    const button = await screen.findByRole('button', { name: 'Load older history' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(actionCalls.filter((before) => before !== undefined)).toHaveLength(3);

    fireEvent.click(button);
    await waitFor(() =>
      expect(actionCalls.filter((before) => before !== undefined)).toHaveLength(6),
    );
  });

  it('N09: pages that each add a row keep loading to the end without a button', async () => {
    // A Commentary and a tool per page: every page opens a chapter, so each adds visible rows.
    const pages = Array.from({ length: 8 }, (_, index) => [
      work({ kind: 'commentary', title: { text: `Page${index} 0`, complete: true } }),
      work({ kind: 'tool', title: { text: `Page${index} 1`, complete: true } }),
    ]);
    const { api, calls } = pagedApi({ turns: { [turnId]: pages } });
    mountTurns(api);
    await openTurn('Open Turn 1');
    const tail = await screen.findByText('Page7 0');
    fireEvent.scroll(workScroller(tail), { target: { scrollTop: 0 } });

    await screen.findByText('Page0 0', {}, { timeout: 5000 });
    expect(older(calls)).toBe(7);
    expect(screen.queryByRole('button', { name: /older history/ })).toBeNull();
  });
});
