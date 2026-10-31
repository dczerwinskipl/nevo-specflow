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
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from './api';
import { createSessionFeed } from './feed';
import { createWorkInspector } from './WorkInspector';

// jsdom never computes real layout, so every element's `scrollTop` would otherwise default to
// (and stay) 0 — indistinguishable from "scrolled to the top". Left alone, that would make the
// auto-load-on-scroll-near-top mount check in WorkInspector.tsx's `useAutoLoadOlder` cascade
// through every page the instant any test with `history.hasOlder: true` opens the Work/Actions
// screen, regardless of what that test is trying to isolate. A real, per-element value — away
// from the near-top threshold by default, exactly like a Turn that opened already showing its
// newest/tail content — lets a test instead explicitly drive "the user is scrolled to/held at the
// top" via `fireEvent.scroll(viewport, { target: { scrollTop: 0 } })`, the same way it would in an
// actually-overflowing browser list.
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

/** The type filter is a `Menu` (never a `SegmentedControl` — see WorkInspector.tsx's
 * WorkFilterBar): its trigger only opens on Enter/Space or a pointer press, never a plain click
 * event, matching the real `@radix-ui/react-dropdown-menu` Trigger contract. */
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

  it('renders Reasoning as a distinct, separately labeled, collapsible "Thinking" summary', async () => {
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
    await screen.findByText('Thinking');
    // Collapsed by default — a tool row never gets this "Thinking" treatment or label.
    const trigger = screen.getByText('Thinking').closest('button');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    clickTrigger('Thinking');
    await waitFor(() => expect(trigger?.getAttribute('aria-expanded')).toBe('true'));
    expect(screen.getByText('The simpler fix risks a regression')).toBeTruthy();
  });

  it('a type filter narrows to one kind while keeping the parent Commentary heading visible', async () => {
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

    selectFilterKind('All', 'Tool');
    await waitFor(() => expect(screen.queryByText('Thinking')).toBeNull());
    // The Commentary that heads the chapter stays visible for context (never stripped away).
    expect(screen.getByText('Checking options…')).toBeTruthy();
    expect(screen.getByText('Run command pnpm test')).toBeTruthy();
  });

  it('search matches a tool title while keeping it grouped under its own Commentary', async () => {
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
    expect(screen.getByText('Checking recovery…')).toBeTruthy();
    expect(screen.getByText('Run command pnpm test')).toBeTruthy();
    expect(screen.queryByText('Read file unrelated.mjs')).toBeNull();
  });

  function ninetyPhaseItems(): WorkSummary[] {
    // 90 Commentary/tool pairs = 180 items; 40 per page -> 5 pages (the synthetic-scalability
    // scenario session-chat-v10-design.md §4 calls out, here with a bounded real page size).
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
