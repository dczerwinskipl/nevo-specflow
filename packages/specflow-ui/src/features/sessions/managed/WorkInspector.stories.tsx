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
  longReadActions,
  longReadWorkId,
  createWorkInspectorFixtureApi,
  largeWorkTimelineItems,
  longRunWorkTimelineItems,
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

/** The type filter is an icon-only `IconButton` opening a `Menu` (WorkInspector.tsx's
 * `WorkFilterBar`), never a `SegmentedControl` or a text-label `Button`: its content is portaled
 * to `document.body`, exactly like the Composer's model picker Menu in
 * `ManagedSession.interactions.stories.tsx` (`openModelMenu`) — so it is found via
 * `[role="menu"]`, not a `canvas`-scoped query. `triggerName` is the trigger's accessible name
 * (`aria-label`), not visible text. */
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

/** The default, representative state of `WorkInspector`: the Work panel already open on a
 * Commentary-grouped (L2) timeline, a representative chapter visible, nothing mid-interaction —
 * the single visible entry point for this component. Its `play` is a light, demonstration-only
 * confirmation that this canonical state actually renders, not a hidden contract suite (Storybook
 * catalog rework, §4 table): that behavioral coverage (grouping, Thinking shown as italic
 * narration, filtering/search preserving Commentary context, isolated failures, the ToolAction
 * drill-in) already lives in `WorkInspector.test.tsx`. The dedicated filtering/search/scale
 * regression checks below are tagged `integration` (they exercise the real
 * `AppWorkspace`/navigation stack this component is mounted through) and stay out of the default
 * sidebar. */
export const Default: Story = {
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
      [longReadWorkId]: longReadActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // A representative chapter — Commentary read directly (no click needed), its operations, and
    // the agent's Thinking shown as narration (italic, no disclosure) — is visible as soon as Work
    // opens; nothing requires interaction to appear.
    await expect(
      await canvas.findByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();
    await expect(canvas.getByText('Read file session.ts')).toBeVisible();
    await expect(
      canvas.getByText(
        'Two approaches could fix this; the narrower one risks missing a related case.',
      ),
    ).toBeVisible();
    // The three happy-path reads/searches right after Commentary are a short run (below
    // `workGrouping.TOOL_BURST_MIN_SIZE`): live owner review #2 — don't wrap 1-4 operations in a
    // synthetic "N tool actions" container, just show the rows. So every one of them is its own
    // directly visible row, with no trigger to click first.
    await expect(canvas.getByText('Read file admission.mjs')).toBeVisible();
    await expect(canvas.getByText('Search code WORKSPACE_WRITER_BLOCKED')).toBeVisible();
    await expect(canvas.getByText('Search code readiness-policy')).toBeVisible();
    // Never a fabricated "0 ms": every fixture item here has identical createdAt/updatedAt, which
    // is not a real zero-duration measurement (live owner review #2, rule 6).
    // (A real measured duration such as "180 ms" is fine; only a standalone zero is not.)
    await expect(canvas.queryByText(/(^|[^\d,.])0\s*ms/)).not.toBeInTheDocument();
  },
};

/**
 * Live owner review #2 (structural pass, rule 3): only a genuinely long run of ADJACENT
 * happy-path operations compacts into a single Timeline marker, and even then the operations it
 * groups never swallow an error or an important interaction that falls right after the run — that
 * stays its own individually visible row. `longRunWorkTimelineItems` is built specifically to
 * demonstrate both halves of that rule in one chapter.
 */
export const LongRunGrouping: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(longRunWorkTimelineItems()),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    await expect(
      await canvas.findByText('Scanning the whole module for every caller before changing it…'),
    ).toBeVisible();
    // The long adjacent run (7 items) compacts into one collapsed-by-default burst trigger —
    // queried by exact role/name, since the Work summary row above it also renders a "9 działań
    // narzędzia" substring as part of its own aggregate counts.
    const burstTrigger = canvas.getByRole('button', { name: '7 działań narzędzia' });

    // Collapsible keeps its panel mounted (height-animated, not removed) — this must assert
    // non-visibility rather than absence from the DOM.
    await expect(canvas.getByText('Read file module-0.ts')).not.toBeVisible();
    // ...but the failed tool immediately after that run is never swallowed by it — it stays its
    // own visible row even though it chronologically follows what is now a grouped run.
    await expect(canvas.getByText('Run command pnpm test')).toBeVisible();

    // Expanding the group reaches every one of its members as plain rows — never a second,
    // independently-dotted mini-Timeline (live owner review #2, rule 5: one marker per group).
    await userEvent.click(burstTrigger);
    await expect(await canvas.findByText('Read file module-0.ts')).toBeVisible();
  },
};

/**
 * Owner review, final correction: "Commentary to nie kontekst chyba?" — Commentary is its own
 * kind, never kept as background/context for another kind's filtered results (reverses this
 * story's own earlier name/premise — see `EveryFilterNarrowsToItsKind` for the current rule).
 * Selecting a non-Commentary kind hides Commentary entirely, same as any other non-matching kind.
 */
export const TypeFilterShowsOnlyItsKind: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
      [longReadWorkId]: longReadActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Checking the implementation and locating the admission path…');
    await expect(
      canvas.getByText(
        'Two approaches could fix this; the narrower one risks missing a related case.',
      ),
    ).toBeVisible();

    // The toolbar row (type-filter Menu + search) must size against the panel's available width,
    // never collapse to max-content.
    assertSearchInputFits(canvas.getByPlaceholderText<HTMLInputElement>('Szukaj w historii pracy'));

    await selectFilterKind(canvasElement, 'Filtruj pracę według typu', 'Narzędzie');
    await waitFor(() =>
      expect(
        canvas.queryByText(
          'Two approaches could fix this; the narrower one risks missing a related case.',
        ),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.queryByText('Permission to write workspace')).not.toBeInTheDocument();
    // Commentary is not kept as a grouping heading for the filtered tool rows either — it is its
    // own kind, and this filter selected "Narzędzie", not it.
    await expect(
      canvas.queryByText('Checking the implementation and locating the admission path…'),
    ).not.toBeInTheDocument();

    // The three happy-path tool reads/searches left after filtering are a short run — below
    // `workGrouping.TOOL_BURST_MIN_SIZE` — so they stay their own individually visible rows, with
    // nothing to click first.
    await expect(canvas.getByText('Read file admission.mjs')).toBeVisible();
    await expect(canvas.getByText('Search code WORKSPACE_WRITER_BLOCKED')).toBeVisible();
    await expect(canvas.getByText('Search code readiness-policy')).toBeVisible();
  },
};

/**
 * Owner review: "each filter behaves differently, you can't predict what to expect", then,
 * reviewing an intermediate fix that kept Commentary visible as "context" for every other kind:
 * "Commentary to nie kontekst chyba?" (Commentary isn't context, is it?). One rule now: every
 * option shows ONLY its own kind — Commentary included, never kept around for another kind's
 * results — and the menu offers only kinds this Turn actually has.
 */
export const EveryFilterNarrowsToItsKind: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
      [longReadWorkId]: longReadActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Read file session.ts');
    const reasoningText =
      'Two approaches could fix this; the narrower one risks missing a related case.';

    await selectFilterKind(canvasElement, 'Filtruj pracę według typu', 'Postęp');
    await waitFor(() => expect(canvas.queryByText('Read file session.ts')).not.toBeInTheDocument());
    await expect(canvas.queryByText(reasoningText)).not.toBeInTheDocument();
    await expect(
      canvas.getByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();

    await selectFilterKind(
      canvasElement,
      'Filtruj pracę według typu (aktywny filtr: Postęp)',
      'Myślenie',
    );
    await expect(await canvas.findByText(reasoningText)).toBeVisible();
    await expect(canvas.queryByText('Read file admission.mjs')).not.toBeInTheDocument();

    await selectFilterKind(
      canvasElement,
      'Filtruj pracę według typu (aktywny filtr: Myślenie)',
      'Interakcja z użytkownikiem',
    );
    await expect(await canvas.findByText('Permission to write workspace')).toBeVisible();
    await expect(canvas.queryByText('Run command pnpm test')).not.toBeInTheDocument();
    await expect(canvas.queryByText(reasoningText)).not.toBeInTheDocument();

    await selectFilterKind(
      canvasElement,
      'Filtruj pracę według typu (aktywny filtr: Interakcja z użytkownikiem)',
      'Wszystkie',
    );
    await expect(await canvas.findByText('Read file session.ts')).toBeVisible();
    await expect(canvas.getByText(reasoningText)).toBeVisible();
    await expect(canvas.getByText('Permission to write workspace')).toBeVisible();
  },
};

/**
 * Owner review: "brakuje mi czasu każdego kroku oraz możliwości podejrzenia szczegółów ... jakie
 * parametry, jaki wynik, ale nie sukces tylko response toola". The operation's title opens its
 * ToolActions; each shows its own elapsed time, the parameters it was called with and the tool's
 * actual response — for a successful action too, not just a bare "completed".
 */
export const ToolActionDetails: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
      [longReadWorkId]: longReadActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /Edit workspace \(3 files\)/ }),
    );

    await expect(await canvas.findByText('Edit · admission.mjs')).toBeVisible();
    await expect(
      await canvas.findByText('Updated src/admission.mjs (1 replacement, lines 42-44).'),
    ).toBeVisible();
    await expect(canvas.getAllByText('Parametry')).toHaveLength(3);
    await expect(canvas.getAllByText('Odpowiedź narzędzia')).toHaveLength(3);
    // Parameters and response sit on the one product code view (as a document's source), read-only.
    // The JSON parameters the product pretty-printed are coloured and numbered; the verbatim
    // response is neither — its lines are the tool's own, so no gutter numbers them.
    const inputs = await canvas.findAllByRole('textbox', { name: 'Parametry' });
    const outputs = await canvas.findAllByRole('textbox', { name: 'Odpowiedź narzędzia' });
    await expect(inputs).toHaveLength(3);
    await expect(outputs).toHaveLength(3);
    for (const block of [...inputs, ...outputs]) {
      await expect(block).toHaveAttribute('aria-readonly', 'true');
    }

    for (const block of inputs) {
      await expect(block.closest('.cm-editor')!.querySelector('.cm-lineNumbers')).not.toBeNull();
    }

    for (const block of outputs) {
      await expect(block.closest('.cm-editor')!.querySelector('.cm-gutters')).toBeNull();
    }

    const spans = [...inputs[0]!.querySelectorAll<HTMLElement>('.cm-line span')];
    const key = spans.find((span) => span.textContent === '"file_path"');
    const value = spans.find((span) => span.textContent === '"src/admission.mjs"');
    if (!key || !value) {
      throw new Error('JSON tokens are not coloured');
    }

    await expect(getComputedStyle(key).color).not.toBe(getComputedStyle(value).color);
    await expect(outputs[0]!.querySelector('.cm-line span')).toBeNull();
    await expect(canvas.getByText(/420 ms/)).toBeVisible();
    await expect(canvas.getByText('Niepowodzenie')).toBeVisible();
    await expect(await canvas.findByText(/AssertionError/)).toBeVisible();
  },
};

/**
 * Owner review, final correction: same "Commentary is not context" rule applies to search —
 * a non-matching Commentary is hidden exactly like any other non-matching row, even though the
 * tool row that DOES match chronologically followed it.
 */
export const SearchShowsOnlyMatches: Story = {
  tags: ['integration'],
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
      [longReadWorkId]: longReadActions(),
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
    // ...and so does the Commentary phase the matching command chronologically followed — its own
    // text never matched "pnpm", so it is not kept around merely to explain the match.
    await expect(
      canvas.queryByText('One test failed; checking the assertion before retrying…'),
    ).not.toBeInTheDocument();
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
