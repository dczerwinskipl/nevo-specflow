import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within, waitFor } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import type { ManagedSessionsApi } from './api';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  richDefaultApi,
  singleTaskSnapshot,
  terminalFailureSnapshot,
  unavailableSnapshot,
  waitingWithoutAttentionSnapshot,
  workSummaryStatesApi,
} from './managedSession.fullSession.stories-support';
import {
  associationsUnreadableContext,
  claudeExecutor,
  genericSpecLevelContext,
  pendingInteractionContext,
  singleTaskContext,
  specRequiredMissingContext,
  terminalOutcomeContext,
  waitingWithoutAttentionContext,
} from './context/sessionContextFixtures';
import type { SessionContextViewModel } from './context/sessionContextTypes';
import {
  Environment,
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  verifyComposerOverlayPadding,
  verifyNoEntryOverlapsComposer,
  verifyNoHeaderOverlapsInteractionPrompt,
} from './managedSession.storyHelpers.stories-support';

/**
 * `SpecFlow/Screens/Managed Session`: the composed Full Session screen. `Default` below is the
 * single visible entry point — a representative generic/spec-level Session with Context open,
 * with no assertion attached, so opening the group always shows a normal, meaningful state
 * without picking another story first (Storybook catalog rework, §3.1 rule 2).
 *
 * Every other export in this file reproduces one specific informational state a user would
 * land on — a generic/spec-level Session (§12), a single-Task execution (§13), a pending
 * interaction (§15), waiting-without-attention (§18), a terminal failure/cancel/interrupt (§19),
 * and an unavailable Session (§20), plus the narrower-fixture states (`WaitingForQuestion`,
 * `QuotaFailure`, `MultipleChoice`) that predate the Full Session Context mock view
 * model — each paired with a geometry/behavior regression assertion for that exact state. They
 * are tagged `contract` so they stay out of the default sidebar (hidden, not deleted: tags only
 * affect visibility, a `play` function is already part of the Chromium suite via Storybook's own
 * `play-fn` tag regardless of this tag) while remaining runnable and reachable through the tag
 * filter or a direct story link. Stories that instead drive a specific user action/flow/regression
 * on top of these states live in `ManagedSession.interactions.stories.tsx`, under the same title.
 * `WorkInspector.stories.tsx` is its own, separately organized group and is untouched.
 *
 * Most of these stories compose the real `ManagedSession` screen (Primary conversation + Context
 * Secondary) from a representative canonical `SessionSnapshot` plus a product-owned Context mock
 * view model (`sessionContextFixtures.ts`) — Context has no real backend projection yet, see the
 * Full Session UX report for that flagged dependency.
 */
/** Full Session §3.4 / acceptance check §24.2: on a split-capable (wide) layout, closing the
 * Context Secondary must leave behind a visible, clickable way to reopen it — not only on narrow
 * layouts. Context is the one tab of the Secondary rail there, with no close of its own and no
 * panel close beside it (secondary-navigation.md, "Root tabs and local navigation"): the
 * Primary header's persistent "Panel boczny" toggle (aria-pressed mirrors the panel) hides and
 * shows the WHOLE side panel — Context and any opened tab — and showing it again restores both.
 * Verified in every state story below that uses the Context mock view model, at 1440px.
 */
async function verifyContextReopens(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const contextTab = () => canvas.queryByRole('tab', { name: 'Kontekst' });
  await waitFor(() => expect(contextTab()).toBeVisible());
  await expect(canvas.queryByRole('button', { name: 'Zamknij panel dodatkowy' })).toBeNull();
  await expect(canvas.queryByRole('button', { name: 'Zamknij Kontekst' })).toBeNull();
  const toggle = await canvas.findByRole('button', { name: 'Panel boczny' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(toggle);
  await waitFor(() => expect(contextTab()).not.toBeInTheDocument());
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(toggle);
  await waitFor(() => expect(contextTab()).toBeVisible());

  // With another tab open, the toggle hides the whole panel, not only Context.
  const historyRow = canvas.queryByRole('button', { name: /^Historia pracy/ });
  if (!historyRow) {
    return;
  }

  await userEvent.click(historyRow);
  const historyTab = () => canvas.queryByRole('tab', { name: /^Historia pracy/ });
  await waitFor(() => expect(historyTab()).toBeVisible());
  await userEvent.click(toggle);
  await waitFor(() => expect(canvas.queryByRole('tablist')).not.toBeInTheDocument());
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(toggle);
  await waitFor(() => expect(historyTab()).toHaveAttribute('aria-selected', 'true'));
  await expect(contextTab()).toBeVisible();
  // Back to Context, the state every story starts from and the rest of its checks expect.
  await userEvent.click(contextTab()!);
  await waitFor(() => expect(contextTab()).toHaveAttribute('aria-selected', 'true'));
}

const meta = {
  title: 'SpecFlow/Screens/Managed Session',
  component: ManagedSession,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
  args: {
    sessionId: fixtureSessionId,
    owner: 'full-session-story',
    api: fixtureApi(sessionFixture()),
    // Story-only stand-in for the real `/specs/$specId` navigation `routes.tsx`'s
    // `ManagedSessionRoute` wires in production (see `ManagedSession`'s own doc comment for
    // `onOpenSpecification`): demonstrates the Specification row's real click wiring on every
    // state story that carries `sessionContext.specification`, without a real router here.
    onOpenSpecification: fn((specification) => console.info('Open Specification', specification)),
    onOpenDocuments: fn((specification) => console.info('Open Documents', specification)),
    onSessionDeleted: fn(),
    onNewSession: fn(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The default, representative state of the composed screen (owner feedback: "Default ma dawać
 * podgląd default stanu, czyli długa sesja, powiązana z taskami, z workiem, etc.") — a long,
 * multi-turn Session with older history, linked Related Tasks visible in Context, and a populated
 * Work timeline reachable via "Zobacz pracę" (`richDefaultApi`,
 * `managedSession.fullSession.stories-support.ts`), not the sparse 2-entry fixture this used
 * before. The single visible entry point for this group — every other export below is a hidden
 * `contract` regression check for one specific state, not a showcase to browse. Deliberately has
 * no `play`: its demonstration value is the rendered state itself. */
export const Default: Story = {
  args: {
    api: richDefaultApi(),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
};

export const GenericSpecLevel: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(genericSpecLevelSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const SingleTaskExecution: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(singleTaskSnapshot()),
    sessionContext: singleTaskContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const PendingInteraction: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(sessionFixture(true)),
    sessionContext: pendingInteractionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyComposerOverlayPadding(canvasElement);
    await verifyContextReopens(canvasElement);
  },
};

/** Same state at the narrow width the audit specifically flagged as visibly broken: the
 * interaction card + composer overlay rendering directly on top of the assistant's answer. */
export const PendingInteractionNarrow: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(sessionFixture(true)),
    sessionContext: pendingInteractionContext(),
  },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    // The static `globals.viewport` resize is asynchronous; this geometry assertion needs the
    // 390px layout and the `ResizeObserver`/scroll corrections it drives to be fully settled
    // first, the same `settleViewport` convention other geometry-sensitive stories already use.
    await settleViewport(390, 844);
    await verifyComposerOverlayPadding(canvasElement);
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): checked at both
    // widths the audit specifically measured.
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
  },
};

/** Pre-Full-Session-fixture counterpart to `PendingInteractionNarrow`: same "pending interaction
 * at narrow width" state, but on the simple `sessionFixture` (no Context) and asserting a
 * different, still-live set of regressions `PendingInteractionNarrow` does not cover — the
 * adaptive single Send/Stop action (never both at once) and native spellcheck staying off the
 * structured interaction-response field (item 6). Kept distinct rather than merged: no other
 * story in this group exercises either assertion. */
export const WaitingForQuestion: Story = {
  tags: ['contract'],
  args: { owner: 'story', api: fixtureApi(sessionFixture(true)) },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Którą część rozwiązania sprawdzić w następnej kolejności?'),
    ).toBeVisible();
    // One adaptive Send/Stop action (not two simultaneous buttons): while the Turn is active and
    // waiting on this interaction, the composer shows the single button as Stop, not a disabled
    // Send — the structured response above is how the user answers.
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
    await expect(canvas.queryByRole('button', { name: 'Wyślij' })).not.toBeInTheDocument();
    // Item 1 regression: at 390px, the large auto-stitching answer must never end up rendered
    // behind the pending-interaction card/composer overlay.
    await verifyNoEntryOverlapsComposer(canvasElement);
    // Item 6 regression: the structured interaction-response field is not free prose, so native
    // spellcheck stays off (no red squiggly underlines on a structured response field).
    await expect(canvas.getByLabelText('Twoja odpowiedź')).toHaveAttribute('spellcheck', 'false');
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): the exact state
    // and widths the audit reproduced live — two "Wymagana odpowiedź" headings rendering on top of
    // each other. Checked at both widths the audit specifically measured.
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
  },
};

export const WaitingWithoutAttention: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(waitingWithoutAttentionSnapshot()),
    sessionContext: waitingWithoutAttentionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const TerminalFailure: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(terminalFailureSnapshot()),
    sessionContext: terminalOutcomeContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyContextReopens(canvasElement);
    const canvas = within(canvasElement);
    // Item 2 regression: the Task's "Still active — no recovery required yet." attention item
    // means no action is needed, so its icon/tone must read as informational ("Do Twojej
    // wiadomości"), not as a contradictory "needs attention" warning.
    const attentionItem = (
      await canvas.findByText('Still active — no recovery required yet.')
    ).closest('li');
    if (!attentionItem) {
      throw new Error('Expected the attention item list entry.');
    }

    await expect(
      within(attentionItem).getByRole('img', { name: 'Do Twojej wiadomości' }),
    ).toBeInTheDocument();
    await expect(
      within(attentionItem).queryByRole('img', { name: 'Wymaga uwagi' }),
    ).not.toBeInTheDocument();

    // Item 4 regression: the outcome entry's icon names the specific outcome, not the generic
    // entry-kind label every outcome used to share.
    const outcomeEntry = canvasElement.querySelector('[data-entry-id="outcome-1"]');
    if (!outcomeEntry) {
      throw new Error('Expected the terminal outcome entry.');
    }

    await expect(
      within(outcomeEntry as HTMLElement).getByRole('img', { name: 'Niepowodzenie' }),
    ).toBeInTheDocument();
  },
};

const quota = sessionFixture();
// Fixture copy stays Polish throughout the story, matching every surrounding label (owner audit:
// this entry was the one English string left over in an otherwise-localized story).
const quotaFailureText = 'Limit zapytań Claude lub ograniczenie szybkości uniemożliwiło operację.';
quota.entries.push({
  ...quota.entries[0]!,
  id: 'quota',
  ordinal: 3,
  kind: 'commentary',
  text: {
    text: quotaFailureText,
    complete: true,
  },
});
quota.entries.push({
  ...quota.entries[0]!,
  id: 'failed',
  ordinal: 4,
  kind: 'outcome',
  text: { text: 'failed', complete: true },
});
/** Pre-Full-Session-fixture failure state: a non-terminal, retry-possible quota/rate-limit
 * failure (simple `sessionFixture`, no Context), distinct from `TerminalFailure`'s
 * Full-Session-fixture terminal/cancelled Turn — the message composer stays enabled here because
 * the Session itself is not done, only the one operation quota blocked. */
export const QuotaFailure: Story = {
  tags: ['contract'],
  args: { owner: 'quota-story', api: fixtureApi(quota) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(quotaFailureText)).toBeVisible();
    await expect(canvas.getByLabelText('Wiadomość')).toBeEnabled();
  },
};

export const Unavailable: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi(unavailableSnapshot()),
    sessionContext: associationsUnreadableContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await verifyContextReopens(canvasElement);
    const canvas = within(canvasElement);
    // Item 3 regression: the Send icon button must visually read as disabled too, matching the
    // already-disabled composer textarea — not stay rendered in the bold `primary` treatment an
    // actionable Send normally gets.
    const sendButton = canvas.getByRole('button', { name: 'Wyślij' });
    await expect(sendButton).toBeDisabled();
    await expect(sendButton.className).not.toMatch(/bg-action-primary\b/);
    await expect(sendButton.className).toMatch(/bg-action-secondary\b/);
  },
};

/**
 * A Session without a message, however it was opened (new-session-ui-spec.md, section 5): the DS
 * ready empty state with the provider's logo and name, centred in the free height above the Composer,
 * which is docked at the bottom. It replaces the former plain "start the conversation" line.
 */
export const EmptySession: Story = {
  tags: ['contract'],
  args: {
    api: fixtureApi({ ...genericSpecLevelSnapshot(), entries: [], history: { hasOlder: false } }),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Claude Code jest gotowy')).toBeVisible();
    await expect(
      canvas.getByText('Napisz wiadomość poniżej, aby rozpocząć rozmowę.'),
    ).toBeVisible();
    await expect(canvas.queryByText('Rozpocznij rozmowę.')).toBeNull();
    await expect(canvas.getByLabelText('Wiadomość')).toBeEnabled();
    // The empty state is centred above the docked Composer, not stacked directly on top of it.
    const title = canvas.getByText('Claude Code jest gotowy').getBoundingClientRect();
    const composer = canvasElement
      .querySelector('[data-composer-overlay]')!
      .getBoundingClientRect();
    await expect(composer.bottom).toBeGreaterThan(window.innerHeight - 40);
    await expect(composer.top - title.bottom).toBeGreaterThan(100);
  },
};

const multiple = sessionFixture(true);
if (multiple.interaction?.kind === 'question') {
  multiple.interaction.maxSelections = 2;
  multiple.interaction.options = [
    ...(multiple.interaction.options ?? []),
    { id: 'telemetry', label: 'Telemetria dostawcy' },
  ];
}

const multipleApi = {
  ...fixtureApi(multiple),
  respond: fn<ManagedSessionsApi['respond']>((_id, interactionId) =>
    Promise.resolve({ turnId: multiple.interaction!.turnId, interactionId }),
  ),
};

/** A question with `maxSelections > 1`: checkboxes capped at the limit, one Respond, keyboard only. */
export const MultipleChoice: Story = {
  tags: ['contract'],
  args: { owner: 'multi-story', api: multipleApi },
  play: async ({ canvasElement }) => {
    multipleApi.respond.mockClear();
    const canvas = within(canvasElement);
    const history = await canvas.findByRole('checkbox', {
      name: 'Wczytywanie starszych wiadomości',
    });
    const recovery = canvas.getByRole('checkbox', { name: 'Odzyskiwanie sesji po restarcie' });
    const telemetry = canvas.getByRole('checkbox', { name: 'Telemetria dostawcy' });
    const respond = canvas.getByRole('button', { name: 'Odpowiedz' });
    await expect(respond).toBeDisabled();
    await expect(canvas.getByText('Wybrano 0 z maksymalnie 2.')).toBeVisible();
    // Keyboard only: focus the last option, then the first, toggling each with Space.
    telemetry.focus();
    await userEvent.keyboard(' ');
    history.focus();
    await userEvent.keyboard(' ');
    await expect(canvas.getByText('Wybrano 2 z maksymalnie 2.')).toBeVisible();
    // Capped: still focusable, announced as unavailable, and Space does not check it.
    await expect(recovery).toHaveAttribute('aria-disabled', 'true');
    recovery.focus();
    await userEvent.keyboard(' ');
    await expect(recovery).not.toBeChecked();
    await expect(respond).toBeEnabled();
    respond.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(multipleApi.respond).toHaveBeenCalledOnce());
    // Declared order, not click order.
    await expect(multipleApi.respond.mock.calls[0]?.[2]).toMatchObject({
      kind: 'question',
      answer: { optionIds: ['history', 'telemetry'] },
    });
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): the multi-select
    // prompt is the tallest interaction card.
    await settleViewport(390, 844);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
  },
};

/** One Work block per Turn in every state (session-chat-v10-design.md §3.1), inside one realistic
 * conversation shaped like real runtime output (one `work-summary` entry per tool Work). Checks:
 * exactly one block per Turn that has Work, one focus target per block, no overflow, the interrupted
 * fact shown once (in its block, no separate outcome row), the Turn without Work keeps its outcome
 * row, only the live block has a spinner, and a block opens that same Turn's Work history. */
async function verifyWorkBlocks(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await waitFor(() => expect(canvasElement.querySelectorAll('[data-work-block]')).toHaveLength(5));
  for (const block of canvasElement.querySelectorAll<HTMLElement>('[data-work-block]')) {
    await expect(block.querySelectorAll('button, a, [tabindex]')).toHaveLength(1);
    const button = block.querySelector('button')!;
    await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
  }

  await expect(canvas.getAllByText('Tura przerwana')).toHaveLength(1);
  await expect(canvas.queryByText('Przerwano')).not.toBeInTheDocument();
  await expect(canvas.getByText('Niepowodzenie')).toBeVisible();
  await expect(canvas.getByText('Nie powiodło się: 1 uruchomienie testów')).toBeVisible();
  await expect(canvas.getByText('4 działania narzędzia')).toBeVisible();
  await expect(canvas.getByText(/i więcej$/)).toBeVisible();
  await expect(canvas.getByText('Myśli…')).toBeVisible();
  // The live line is the only spinner in the conversation; the header defers to it.
  await expect(canvasElement.querySelectorAll('[data-work-block] .animate-spin')).toHaveLength(1);

  // `\s` (not a literal space) between the count and its noun: `workSummary.kind.*` now joins
  // them with a non-breaking space so a count never wraps away from its unit (owner audit, live
  // on mobile: "2 / odczyty" split across two lines) — a literal-space regex stopped matching.
  await userEvent.click(canvas.getByRole('button', { name: /4\sodczyty\s·\s1\swyszukiwanie/ }));
  // That Turn's own Work history: its 5 tool actions, and nothing from other Turns.
  await waitFor(() => expect(canvas.getByText('5 elementów przebiegu')).toBeVisible());
}

export const WorkSummaryStates: Story = {
  tags: ['contract'],
  args: {
    api: workSummaryStatesApi(),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyWorkBlocks(canvasElement),
};

export const WorkSummaryStatesNarrow: Story = {
  tags: ['contract'],
  args: { api: workSummaryStatesApi() },
  globals: NARROW_VIEWPORT,
};

/** The Secondary's "Praca" (Work) section label, found within the Context panel. */
function workSectionTop(canvasElement: HTMLElement) {
  const label = [...canvasElement.querySelectorAll('section')].find(
    (section) => section.firstElementChild?.textContent === 'Praca',
  );
  if (!label) {
    throw new Error('Work section not found');
  }

  return label.getBoundingClientRect().top;
}

async function openContextOnNarrow(canvasElement: HTMLElement) {
  await settleViewport(390, 844);
  const canvas = within(canvasElement);
  await waitFor(() =>
    expect(canvasElement.querySelector('[data-composer-overlay]')).not.toBeNull(),
  );
  // The collapsing header is covered (inert) while the conversation is pinned at the bottom.
  const scroller = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
  if (scroller) {
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  await userEvent.click(await canvas.findByRole('button', { name: 'Kontekst' }));
}

/** The real route today: no `sessionContext` prop at all. Executor from the provider catalogue, the
 * scope-unknown info note under it, Work history derived from the snapshot, then Planned areas.
 * No Specification/Execution/Attention/Related Tasks (nothing is promised there). */
export const RealRouteContext: Story = {
  tags: ['contract'],
  args: { api: richDefaultApi() },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Wykonawca')).toBeVisible();
    await expect(
      await canvas.findByText(
        'Powiązania tej sesji ze specyfikacją i zadaniami nie są jeszcze dostępne.',
      ),
    ).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /^Historia pracy/ })).toBeVisible();
    await expect(canvas.getByText('Planowane obszary')).toBeVisible();
    await expect(canvas.queryByText('Specyfikacja')).toBeNull();
    await expect(canvas.queryByText('Aktualne wykonanie')).toBeNull();
  },
};

export const RealRouteContextNarrow: Story = {
  tags: ['contract'],
  args: { api: richDefaultApi() },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await openContextOnNarrow(canvasElement);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Powiązania tej sesji ze specyfikacją i zadaniami nie są jeszcze dostępne.',
      ),
    ).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /^Historia pracy/ })).toBeVisible();
  },
};

/** A Specification-scoped Session whose Specification cannot be found: a danger note in the
 * Specification slot (required reference), the rest of Context still shows. */
export const ContextRequiredMissing: Story = {
  tags: ['contract'],
  args: { api: richDefaultApi(), sessionContext: specRequiredMissingContext() },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = await canvas.findByText(
      'Nie znaleziono specyfikacji SPEC-A, do której należy ta sesja.',
    );
    await expect(note).toBeVisible();
    await expect(note.closest('p')?.querySelector('.text-status-danger')).not.toBeNull();
    await expect(canvas.queryByText('Dokumenty')).toBeNull();
  },
};

export const ContextRequiredMissingNarrow: Story = {
  tags: ['contract'],
  args: { api: richDefaultApi(), sessionContext: specRequiredMissingContext() },
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await openContextOnNarrow(canvasElement);
    await expect(
      await within(canvasElement).findByText(
        'Nie znaleziono specyfikacji SPEC-A, do której należy ta sesja.',
      ),
    ).toBeVisible();
  },
};

/** The Session's executor is not in the provider catalogue any more: a danger note. */
export const ExecutorMissing: Story = {
  tags: ['contract'],
  args: {
    api: richDefaultApi(),
    sessionContext: { scope: { kind: 'standalone' }, executor: { status: 'missing' } },
  },
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Wykonawca tej sesji nie jest już dostępny.'),
    ).toBeVisible();
  },
};

const loadingContext: SessionContextViewModel = {
  scope: { kind: 'task', taskCount: 1 },
  executor: { status: 'ready', value: claudeExecutor },
  specification: { status: 'loading' },
  executionScope: { status: 'loading' },
  relatedTasks: { status: 'loading' },
  workHistory: { status: 'ready', value: { turnId: '00000000-0000-4000-8000-000000000010' } },
};
const readyContext: SessionContextViewModel = {
  ...loadingContext,
  specification: {
    status: 'ready',
    value: { id: 'spec-a', key: 'SPEC-A', title: 'Workflow admission hardening' },
  },
  executionScope: {
    status: 'ready',
    value: {
      kind: 'single-task',
      task: { id: 'task-03', key: 'TASK-03', title: 'Deterministic admission' },
    },
  },
  relatedTasks: {
    status: 'ready',
    value: [{ id: 'task-02', key: 'TASK-02', title: 'Document the admission guard' }],
  },
};
let releaseContext: (() => void) | undefined;

function LoadingToReadyHost(props: ComponentProps<typeof ManagedSession>) {
  const [released, setReleased] = useState(false);
  useEffect(() => {
    releaseContext = () => setReleased(true);

    return () => {
      releaseContext = undefined;
    };
  }, []);

  return <ManagedSession {...props} sessionContext={released ? readyContext : loadingContext} />;
}

/** Context data arriving after first paint: skeleton rows are replaced in place and nothing below
 * them moves — the Work section's top is measured before and after the facts resolve. */
export const ContextLoadingToReady: Story = {
  tags: ['contract'],
  args: { api: richDefaultApi() },
  render: (args) => <LoadingToReadyHost {...args} />,
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(workSectionTop(canvasElement)).toBeGreaterThan(0));
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[data-context-skeleton-row]').length).toBeGreaterThan(
        0,
      ),
    );
    await settleViewport();
    const before = workSectionTop(canvasElement);
    releaseContext?.();
    await canvas.findByText('Deterministic admission');
    await canvas.findByText('Dokumenty');
    await settleViewport();
    await expect(canvasElement.querySelectorAll('[data-context-skeleton-row]')).toHaveLength(0);
    const after = workSectionTop(canvasElement);
    console.info('Work section top before/after', before, after);
    await expect(Math.abs(after - before)).toBeLessThanOrEqual(0.5);
  },
};
