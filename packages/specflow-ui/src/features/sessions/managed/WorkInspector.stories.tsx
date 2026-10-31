import { useMemo, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { fixtureSessionId } from './managedSession.stories-support';
import {
  actionsWorkId,
  createWorkInspectorFixtureApi,
  largeWorkTimelineItems,
  mixedWorkTimelineActions,
  mixedWorkTimelineItems,
  workInspectorTurnId,
} from './managedSession.workInspector.stories-support';

/**
 * The MUST-FIX Work (L2) timeline rebuild: Commentary-grouped chapters, a distinct collapsible
 * "Thinking" (Reasoning) row, type filters and search that preserve Commentary context, and
 * progressive ("Load older") paging instead of the old flat list's manual Starsze/Nowsze buttons.
 *
 * This mounts `createWorkInspector` directly through the real `AppWorkspace`/Secondary-stack
 * runtime (the same mechanism `ManagedSession.tsx` uses via `navigation.open(workStack, ...)`),
 * deliberately not through `ManagedSession` itself, which is under unrelated, parallel edit.
 */
function Environment({ children }: { children: ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  return (
    <StoryLocalization locale="pl">
      <QueryClientProvider client={query}>
        <div className="h-dvh">
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspaceProvider>{children}</AppWorkspaceProvider>
          </AppShell>
        </div>
      </QueryClientProvider>
    </StoryLocalization>
  );
}

function WorkInspectorHost({ api }: { api: ManagedSessionsApi }) {
  const feed = useMemo(
    () => createSessionFeed(api, fixtureSessionId, 'work-inspector-story'),
    [api],
  );
  const workStack = useMemo(
    () => createWorkInspector(api, feed, 'work-inspector-story'),
    [api, feed],
  );
  const navigation = useSecondaryNavigation();

  // `fit="available"` + `split="dynamic"` mirror `ManagedSession.tsx`'s real `<AppWorkspace>`
  // usage. Without them this harness defaulted to `fit="content"` + the fixed `split="primary"`
  // 75/25 preset, which — unlike `dynamic`'s `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` (330px) floor
  // — gives the Secondary drill-in panel only ~25% of the content width (≈293px at 1440px),
  // collapsing the toolbar row and clipping the search field well below what the real app ever
  // renders (`WorkFilterBar`'s own filter-Menu-not-SegmentedControl choice is explicitly sized
  // against that same 330px floor).
  return (
    <AppWorkspace fit="available" split="dynamic">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Sesja" />}>
        <button
          type="button"
          onClick={() =>
            void navigation.open(workStack, {
              sessionId: fixtureSessionId,
              turnId: workInspectorTurnId,
            })
          }
        >
          Zobacz pracę
        </button>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

const meta = {
  title: 'SpecFlow/Components/Work Inspector',
  component: WorkInspectorHost,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
} satisfies Meta<typeof WorkInspectorHost>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openWork(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('Zobacz pracę'));
}

/**
 * Regression for the collapsed-search-field bug (session-work-inspector-ui-spec.md / live-review
 * fix): a `w-max` (max-content) ancestor collapsed the drill-in panel's toolbar row to ~260px, so
 * the search `<TextInput>` shrank to ~118px and its own placeholder rendered cut off mid-word.
 * `clientWidth` alone would not catch that regression (a narrow box with a narrow placeholder both
 * "render"), so this checks the input is wide enough to lay the placeholder out without overflow —
 * `scrollWidth` is the text's required width, `clientWidth` the box actually got.
 */
function assertSearchInputFits(search: HTMLInputElement) {
  if (search.scrollWidth > search.clientWidth) {
    throw new Error(
      `The Work search placeholder needs ${search.scrollWidth}px but only got ${search.clientWidth}px — it is being clipped (window ${window.innerWidth}px).`,
    );
  }

  const panel = search.closest('[data-workspace-surface="secondary"]');
  const panelWidth = panel?.getBoundingClientRect().width;

  if (panelWidth !== undefined && !(search.clientWidth / panelWidth >= 0.3)) {
    throw new Error(
      `Expected the search field to take a reasonable share of the drill-in panel's width, found ${search.clientWidth}px of ${panelWidth}px (window ${window.innerWidth}px).`,
    );
  }
}

/** The type filter is a `Menu` (WorkInspector.tsx's `WorkFilterBar`), never a `SegmentedControl`:
 * its content is portaled to `document.body`, exactly like the Composer's model picker Menu in
 * `ManagedSession.interactions.stories.tsx` (`openModelMenu`) — so it is found via
 * `[role="menu"]`, not a `canvas`-scoped query. */
async function selectFilterKind(canvasElement: HTMLElement, triggerName: string, kindName: string) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: triggerName }));
  const menu = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('[role="menu"]');
    if (!element) {
      throw new Error('The Work type-filter menu should open.');
    }

    return element;
  });
  await userEvent.click(within(menu).getByRole('menuitemradio', { name: kindName }));
  await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeInTheDocument());
}

/** The default, representative state of `WorkInspector`: the Commentary-grouped (L2) timeline
 * with a collapsible Reasoning ("Thinking") row and a tool drill-in — the single visible entry
 * point for this component. Its `play` is a demonstration walk-through of the component's own key
 * states, not a hidden contract suite (Storybook catalog rework, §4 table). The dedicated
 * filtering/search/scale regression checks below are tagged `integration` (they exercise the real
 * `AppWorkspace`/navigation stack this component is mounted through) and stay out of the default
 * sidebar. */
export const Default: Story = {
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // Leading tool operations before any Commentary default to "Start of Turn".
    await expect(await canvas.findByText('Początek tury')).toBeVisible();
    await expect(canvas.getByText('Read file session.ts')).toBeVisible();

    // The Commentary itself is a readable Markdown heading for the phase that follows it.
    await expect(
      canvas.getByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();

    // Reasoning is a distinct, separately labeled, collapsible "Thinking" summary — collapsed by
    // default, never styled like a tool row or presented as Commentary.
    const thinkingTrigger = canvas.getByText('Myślenie').closest('button');
    if (!thinkingTrigger) {
      throw new Error('Expected "Myślenie" to be a disclosure trigger.');
    }

    await expect(thinkingTrigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(thinkingTrigger);
    await expect(
      await canvas.findByText(
        'Two approaches could fix this; the narrower one risks missing a related case.',
      ),
    ).toBeVisible();

    // A failed command stays its own isolated row — it never disappears into a successful group.
    await expect(canvas.getByText('Run command pnpm test')).toBeVisible();

    // Selecting a tool Work item with child ToolActions opens that exact Work's detail.
    await userEvent.click(canvas.getByText('Działania narzędzia'));
    await expect(await canvas.findByText('Edit · admission.mjs')).toBeVisible();
    await expect(canvas.getByText('Execute · pnpm test')).toBeVisible();
  },
};

export const TypeFilterPreservesCommentaryContext: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Checking the implementation and locating the admission path…');
    await expect(canvas.getByText('Myślenie')).toBeVisible();

    // The toolbar row (type-filter Menu + search) must size against the panel's available width,
    // never collapse to max-content.
    assertSearchInputFits(canvas.getByPlaceholderText<HTMLInputElement>('Szukaj w historii pracy'));

    await selectFilterKind(canvasElement, 'Wszystkie', 'Narzędzie');
    await waitFor(() => expect(canvas.queryByText('Myślenie')).not.toBeInTheDocument());
    // The Commentary heading that groups the remaining tool rows is never stripped away.
    await expect(
      canvas.getByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();

    // The three happy-path tool reads/searches left after filtering compact into one collapsible
    // burst row; expanding it reaches the exact tool rows, still under their Commentary.
    const burstTrigger = canvas.getByText(/działania narzędzia/).closest('button');
    if (!burstTrigger) {
      throw new Error('Expected the tool burst to be a disclosure trigger.');
    }

    await userEvent.click(burstTrigger);
    await expect(await canvas.findByText('Read file admission.mjs')).toBeVisible();
  },
};

export const SearchPreservesCommentaryContext: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Początek tury');

    const search = canvas.getByPlaceholderText<HTMLInputElement>('Szukaj w historii pracy');
    assertSearchInputFits(search);
    await userEvent.type(search, 'pnpm');

    // The unrelated Start of Turn chapter (no matching child) disappears entirely...
    await waitFor(() => expect(canvas.queryByText('Początek tury')).not.toBeInTheDocument());
    // ...while the matching command still shows which Commentary phase it belongs to.
    await expect(
      canvas.getByText('One test failed; checking the assertion before retrying…'),
    ).toBeVisible();
    await expect(canvas.getByText('Run command pnpm test')).toBeVisible();
  },
};

export const ProgressiveLoadingAtScale: Story = {
  tags: ['integration'],
  args: {
    // The design doc's own "144 synthetic Work items" scalability scenario.
    api: createWorkInspectorFixtureApi(largeWorkTimelineItems(144)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // Only a bounded window is mounted up front (never an eager walk of the whole 144-item
    // history) — the earliest phase is nowhere in the DOM yet.
    await canvas.findAllByText(/narrowing the admission failure…/);
    const initialCount = canvas.getAllByText(/narrowing the admission failure…/).length;
    await expect(canvas.queryByText(/Phase 0: narrowing/)).not.toBeInTheDocument();

    const viewport = canvasElement.querySelector<HTMLElement>(
      '[data-workspace-surface="secondary"] .scroll-area-viewport',
    );
    if (!viewport) {
      throw new Error('Expected the Work scroller viewport to be mounted.');
    }

    // Auto-loads on scroll near the top instead of a manual button (live-review fix #3,
    // `useAutoLoadOlder` in WorkInspector.tsx). Each successful page prepend restores the scroll
    // anchor over the content the user was already viewing, which pushes `scrollTop` back away
    // from the near-top threshold — exactly like `ManagedSession.tsx`'s own conversation scroller
    // — so this keeps re-driving the scroller back to the top itself, the same way a user actually
    // holding the scrollbar at the top edge would, until the oldest page is reached.
    await waitFor(
      async () => {
        viewport.scrollTop = 0;
        viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
        await expect(canvas.queryByText(/Phase 0: narrowing/)).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    // The already-rendered tail content survives every merge — it is never discarded or refetched.
    const finalCount = canvas.getAllByText(/narrowing the admission failure…/).length;
    await expect(finalCount).toBeGreaterThan(initialCount);

    // Once exhausted (`history.hasOlder: false`), further "near the top" scroll events load
    // nothing more — the busy indicator settles and no error appears.
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await waitFor(() => expect(canvas.queryByText(/Phase 0: narrowing/)).toBeInTheDocument());
  },
};
