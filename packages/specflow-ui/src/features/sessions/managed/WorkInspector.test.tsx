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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

function clickTrigger(label: string) {
  const trigger = screen.getByText(label).closest('button');
  if (!trigger) {
    throw new Error(`Expected "${label}" to be inside a trigger button.`);
  }

  fireEvent.click(trigger);
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

    clickTrigger('Tool');
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

  it('fetches only one bounded tail page up front and loads older pages progressively on request', async () => {
    // 90 Commentary/tool pairs = 180 items; 40 per page -> 5 pages (the synthetic-scalability
    // scenario session-chat-v10-design.md §4 calls out, here with a bounded real page size).
    const items: WorkSummary[] = [];
    for (let index = 0; index < 90; index += 1) {
      items.push(
        work({ kind: 'commentary', title: { text: `Phase ${index}…`, complete: true } }),
        work({ kind: 'tool', title: { text: `Run step ${index}`, complete: true } }),
      );
    }

    const { api, calls } = fixtureApi(items, 40);

    await openWork(api);
    // The tail page (phases 80-89) is visible...
    await screen.findByText('Phase 85…');
    // ...but nothing from an older, not-yet-fetched page has been rendered.
    expect(screen.queryByText('Phase 70…')).toBeNull();
    // Only the newest (tail) page was requested — not an eager walk of the whole 180-item history.
    expect(calls).toEqual([undefined]);

    fireEvent.click(screen.getByText('Load older Work'));
    await screen.findByText('Phase 70…');
    expect(calls).toEqual([undefined, '3']);
    // The already-rendered tail content survives the merge — it is not discarded or refetched.
    expect(screen.getByText('Phase 85…')).toBeTruthy();
  });
});
