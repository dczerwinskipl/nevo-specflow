import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ManagedSessionsApi } from './api';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import {
  actionsWorkId,
  answeredQuestionItems,
  claudeTurnWorkItems,
  claudeWriteActions,
  claudeWriteWorkId,
  longReadActions,
  longReadWorkId,
  createWorkInspectorFixtureApi,
  dogfoodEditActions,
  dogfoodEditWorkId,
  dogfoodTurnWorkItems,
  largeWorkTimelineItems,
  longRunWorkTimelineItems,
  mixedWorkTimelineActions,
  mixedWorkTimelineItems,
} from './managedSession.workInspector.stories-support';
import {
  WorkInspectorEnvironment,
  WorkInspectorHost,
  openWork,
} from './managedSession.workInspectorHost.stories-support';
import { resetWorkHistoryView } from './workHistoryViewPreference';

/** Every operation its own row (the detailed view), for a story that checks single rows. */
function detailedView() {
  window.localStorage.setItem('nevo:work-history:view', 'detailed');
  resetWorkHistoryView();

  return () => {
    window.localStorage.removeItem('nevo:work-history:view');
    resetWorkHistoryView();
  };
}

/**
 * The MUST-FIX Work (L2) timeline rebuild: Commentary-grouped chapters, a distinct collapsible
 * "Thinking" (Reasoning) row, type filters and search that preserve Commentary context, and
 * progressive ("Load older") paging instead of the old flat list's manual Starsze/Nowsze buttons.
 * Mounted through the shared harness (`WorkInspectorHost`).
 */
const meta = {
  title: 'SpecFlow/Components/Work Inspector',
  component: WorkInspectorHost,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <WorkInspectorEnvironment>
        <Story />
      </WorkInspectorEnvironment>
    ),
  ],
} satisfies Meta<typeof WorkInspectorHost>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Regression for the collapsed-search-field bug (live-review
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
    // Compact by default (owner, PR 169): the happy-path reads/searches right after Commentary are
    // one group row, collapsed; expanding it shows each of them as its own row.
    const group = canvas.getByRole('button', { name: '3 działania narzędzia' });
    await expect(canvas.getByText('Read file admission.mjs')).not.toBeVisible();
    await userEvent.click(group);
    await expect(await canvas.findByText('Read file admission.mjs')).toBeVisible();
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
  beforeEach: detailedView,
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

    // In the detailed view the tool reads/searches left after filtering are their own visible rows.
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
      'Pytanie lub prośba o zgodę',
    );
    await expect(await canvas.findByText('Permission to write workspace')).toBeVisible();
    await expect(canvas.queryByText('Run command pnpm test')).not.toBeInTheDocument();
    await expect(canvas.queryByText(reasoningText)).not.toBeInTheDocument();

    await selectFilterKind(
      canvasElement,
      'Filtruj pracę według typu (aktywny filtr: Pytanie lub prośba o zgodę)',
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
    await expect(canvas.getAllByText('Wynik')).toHaveLength(3);
    // Parameters and response sit on the one product code view (as a document's source), read-only.
    // The JSON parameters the product pretty-printed are coloured and numbered; the verbatim
    // response is neither — its lines are the tool's own, so no gutter numbers them.
    const inputs = await canvas.findAllByRole('textbox', { name: 'Parametry' });
    const outputs = await canvas.findAllByRole('textbox', { name: 'Wynik' });
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

/** The Work tail refresh fails after the history was loaded (the API goes away, then Work remounts): the loaded Work stays on screen with an explicit refresh-failure notice rather
 * than being replaced by a full-screen error (data-loading-and-integration.md "Refresh with
 * usable data"). */
export const FailedRefreshKeepsLoadedWork: Story = {
  tags: ['integration'],
  args: (() => {
    const base = createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    });
    let tailCalls = 0;

    return {
      api: {
        ...base,
        work: (sessionId, turnId, before, signal) => {
          if (before === undefined && ++tailCalls > 1) {
            return Promise.reject(new Error('API unavailable'));
          }

          return base.work(sessionId, turnId, before, signal);
        },
      } satisfies ManagedSessionsApi,
    };
  })(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Read file session.ts');

    // Drilling into a ToolAction and coming back remounts Work, whose stale tail refetches — and
    // fails now that the API is gone.
    await userEvent.click(
      await canvas.findByRole('button', { name: /Edit workspace \(3 files\)/ }),
    );
    await userEvent.click(await canvas.findByRole('button', { name: /^(Back|Wstecz)/ }));

    await expect(
      await canvas.findByText('Nie udało się odświeżyć. Pokazane dane mogą być nieaktualne.'),
    ).toBeVisible();
    await expect(canvas.getByText('Read file session.ts')).toBeVisible();
    await expect(
      canvas.queryByText('Nie udało się wczytać tej części sesji.'),
    ).not.toBeInTheDocument();
  },
};

/**
 * A realistic Claude Turn (owner dogfood, 2026-11-24): every row says what it did and on what, in
 * the UI's words, with no provider name; a permission says what the person decided or that it
 * waits; the failed write names the file and the reason on its row; the agent's note heads the
 * next phase. Opening the write shows a readable header, the written content, a relative
 * response, and the raw parameters one click away.
 */
export const ClaudeTurn: Story = {
  args: {
    api: createWorkInspectorFixtureApi(claudeTurnWorkItems(), {
      [claudeWriteWorkId]: claudeWriteActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // Only the action is emphasised; the subject reads as an identifier (mono, regular weight).
    const subjects = await canvas.findAllByText(
      'mkdir -p /tmp/dummy-job && cd /tmp/dummy-job && ./hello.sh …',
    );
    // The command and the permission it needed are one row (`foldPermissions`).
    await expect(subjects).toHaveLength(1);
    for (const subject of subjects) {
      await expect(subject).toHaveAttribute('data-work-subject');
      await expect(getComputedStyle(subject).fontWeight).toBe('400');
    }

    await expect(canvas.getAllByText('Uruchomiono polecenie')[0]).toBeVisible();
    // A permission says what the owner decided, never the tool's own wording.
    await expect(canvas.getByText('Zezwolono')).toBeVisible();
    await expect(canvas.getByText('Czeka na Ciebie')).toBeVisible();
    await expect(
      canvas.getByText(
        'dummy-scratch/test.sh: File has not been read yet. Read it first before writing to it.',
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "The file tools can only write inside the worktree, so I'll use a scratch directory there and delete it afterwards.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByText(/Claude (tools|permission|commentary)/)).toBeNull();

    await userEvent.click(
      canvas.getByRole('button', { name: /Zapisano plik i 2 więcej · dummy-scratch\/job\.sh/ }),
    );
    await expect((await canvas.findAllByText('Zapisano plik')).length).toBeGreaterThan(0);
    await expect((await canvas.findAllByRole('textbox', { name: 'Treść' })).length).toBe(3);
    await expect(
      await canvas.findByText('File created successfully at: dummy-scratch/job.sh'),
    ).toBeInTheDocument();
    // The headers and responses name files relative to the worktree (the raw parameters keep
    // the tool's own absolute paths).
    for (const response of canvas.getAllByRole('textbox', { name: 'Wynik' })) {
      await expect(response.textContent).not.toContain('C:/Users');
    }

    await expect(canvas.getAllByRole('button', { name: 'Surowe parametry' })[0]).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // One Wrap lines for the screen, in its header (none per block), pressed state announced —
    // the same page-level toggle as Work history's view; each block keeps its own Copy.
    const toggle = () => within(document.body).getByRole('button', { name: 'Zawijaj wiersze' });
    await expect(toggle().closest('[data-workspace-header="true"]')).not.toBeNull();
    const before = toggle().getAttribute('aria-pressed');
    await userEvent.click(toggle());
    await expect(toggle()).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');

    // On a phone it is icon-only, its words kept as the accessible name (and the tooltip).
    await settleViewport(412, 915);
    await waitFor(() => expect(toggle().textContent?.trim()).toBe(''));
    const iconOnly = (button: HTMLElement) => button.querySelector('span.sr-only') !== null;
    await expect(iconOnly(canvas.getAllByRole('button', { name: /^Kopiuj/ })[0]!)).toBe(true);
  },
};

/**
 * The Turn the owner reported (dogfood 4): allowed commands, five failed edits of one long path, a
 * failed read under its own note, an interrupted edit. Opening the first failed edit shows its
 * detail: the action and the file name in the header, the full path under it.
 */
export const DogfoodTurn: Story = {
  args: {
    api: createWorkInspectorFixtureApi(dogfoodTurnWorkItems(), {
      [dogfoodEditWorkId]: dogfoodEditActions(),
    }),
  },
};

/**
 * Owner, PR 169: an answered question says what was asked and what the owner answered ("Scope → All
 * batches A–E (Recommended), …"); opening it shows every option with the chosen one marked. A
 * question from before answers were recorded keeps its plain row. Checked at 375 px and desktop.
 */
export const AnsweredQuestions: Story = {
  tags: ['integration'],
  args: { api: createWorkInspectorFixtureApi(answeredQuestionItems()) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = 'Scope → All batches A–E (Recommended), Do Sessions last, behind the other four.';
    for (const [width, height] of [
      [375, 812],
      [1440, 900],
    ] as const) {
      await settleViewport(width, height);
      if (width === 375) {
        await openWork(canvasElement);
      }

      await expect(await canvas.findByText(row)).toBeVisible();
      await expect(
        canvas.getByText('Fault scenarios → A test-only port, never in the public schemas.'),
      ).toBeVisible();
      await userEvent.click(canvas.getByText(row));
      const detail = await waitFor(() => {
        const node = canvasElement.querySelector<HTMLElement>('[data-question-detail]');
        if (!node) {
          throw new Error('The question detail is not open.');
        }

        return node;
      });
      await expect(detail.querySelector('[data-chosen="true"]')).toHaveTextContent(
        'All batches A–E (Recommended)',
      );
      await expect(within(detail).getByText('Batch A only')).toBeVisible();
      // No horizontal overflow at either width, against the frame's own width, once the panel
      // has finished sliding in (a mid-slide panel is translated past the right edge).
      await waitFor(
        () => expect(detail.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth),
        { timeout: 3000 },
      );
      await userEvent.click(canvas.getByText(row));
    }
  },
};
