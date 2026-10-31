import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  richDefaultApi,
  singleTaskSnapshot,
  terminalFailureSnapshot,
  unavailableSnapshot,
  waitingWithoutAttentionSnapshot,
} from './managedSession.fullSession.stories-support';
import {
  genericSpecLevelContext,
  pendingInteractionContext,
  singleTaskContext,
  terminalOutcomeContext,
  unavailableContext,
  waitingWithoutAttentionContext,
} from './context/sessionContextFixtures';
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
 * `QuotaFailure`, `UnsupportedMultipleChoice`) that predate the Full Session Context mock view
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
 * Context Secondary via its own close control must leave behind a visible, clickable way to
 * reopen it — not only on narrow layouts. Verifies the regression is fixed in every state story
 * below that uses the Context mock view model, at a wide (1440px) viewport.
 */
async function verifyContextReopens(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const doc = canvasElement.ownerDocument;
  const closeLabel = 'Zamknij panel dodatkowy';
  const reopenLabel = 'Kontekst';
  await expect(await canvas.findByRole('button', { name: closeLabel })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: closeLabel }));
  await waitFor(() =>
    expect(canvas.queryByRole('button', { name: closeLabel })).not.toBeInTheDocument(),
  );
  // The reopen control sits in the Primary header's "More actions" menu budget (not a direct
  // action), the same established pattern as the pre-existing narrow-mode Context action.
  await userEvent.click(await canvas.findByRole('button', { name: 'More actions' }));
  const reopen = await within(doc.body).findByRole('menuitem', { name: reopenLabel });
  await userEvent.click(reopen);
  await waitFor(() => expect(canvas.getByRole('button', { name: closeLabel })).toBeVisible());
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
    sessionContext: unavailableContext(),
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

const multiple = sessionFixture(true);
if (multiple.interaction?.kind === 'question') {
  multiple.interaction.maxSelections = 2;
}

export const UnsupportedMultipleChoice: Story = {
  tags: ['contract'],
  args: { owner: 'multi-story', api: fixtureApi(multiple) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('To pytanie wymaga kontrolek, które nie są jeszcze dostępne.'),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Wczytywanie starszych wiadomości' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Odpowiedz' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Zatrzymaj' })).toBeEnabled();
    // Status-line/InteractionPrompt overlap regression (owner audit, 320-390px): this story also
    // renders `snapshot.interaction` (an unsupported multi-select question), so it is one of the
    // states the audit flagged as likely affected even though it has no dedicated narrow viewport
    // of its own yet.
    await settleViewport(390, 844);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
    await settleViewport(320, 568);
    await verifyNoHeaderOverlapsInteractionPrompt(canvasElement);
  },
};
