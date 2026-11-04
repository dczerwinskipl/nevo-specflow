import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ConversationEntry, SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  longConversationLastMessage,
  longConversationSnapshot,
} from './managedSession.fullSession.stories-support';
import { liveFixtureApi, nextAnswer } from './managedSession.liveFeed.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import { Environment } from './managedSession.storyHelpers.stories-support';

/**
 * Where the conversation stays while things change around the reader (the scroll-position policy,
 * `conversation/useConversationScroll.ts`): following the latest message keeps it pinned, and a
 * reader who scrolled away keeps their reading position whatever arrives, grows, loads or re-lays
 * out — on the stacked (390) and the split (1280) layout alike. Every play acts inside the window in
 * which the screen has not yet published "away" to the feed (its 100 ms pill debounce): the reader's
 * scroll and the change it races land in the same task. Same title as the other Managed Session
 * groups; hidden `contract`.
 */
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
    owner: 'scroll-position-story',
    api: liveFixtureApi(longConversationSnapshot()).api,
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;
/** A scenario's args and play; each story below adds its own static `tags` (read by the indexer). */
type Scenario = Pick<Story, 'args' | 'play'>;

const STACKED = { width: 390, height: 844 } as const;
const SPLIT = { width: 1280, height: 844 } as const;

const nextFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

function scrollerOf(canvasElement: HTMLElement) {
  const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
  if (!node) {
    throw new Error('Expected a conversation scroll owner (data-session-scroller).');
  }

  return node;
}

const distanceFromBottom = (node: HTMLElement) =>
  Math.round(node.scrollHeight - node.clientHeight - node.scrollTop);

const latestPill = (canvasElement: HTMLElement) =>
  within(canvasElement).queryByRole('button', { name: 'Wróć do najnowszych wiadomości' });

/** The reader's gesture: moves the scroll owner and delivers its `scroll` event in this same task. */
function readerScrollsTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event('scroll'));
}

/** The first entry still visible below the scroller's top edge, and its offset from that edge. */
function firstVisibleEntry(scroller: HTMLElement) {
  const top = scroller.getBoundingClientRect().top;
  const entry = [...scroller.querySelectorAll<HTMLElement>('[data-entry-id]')].find(
    (element) => element.getBoundingClientRect().bottom > top + 1,
  );
  if (!entry?.dataset.entryId) {
    throw new Error('Expected a visible conversation entry.');
  }

  return { id: entry.dataset.entryId, offset: entry.getBoundingClientRect().top - top };
}

function entryOffset(scroller: HTMLElement, id: string) {
  const entry = scroller.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`);
  if (!entry) {
    throw new Error(`Entry ${id} is no longer rendered.`);
  }

  return entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

/** The reader still sees the entry they were reading, where they were reading it. */
async function expectReadingPosition(
  scroller: HTMLElement,
  anchor: { id: string; offset: number },
  label: string,
) {
  await expect(
    Math.round(entryOffset(scroller, anchor.id)),
    `${label}: "${anchor.id}" stays where the reader was reading it`,
  ).toBeGreaterThanOrEqual(Math.round(anchor.offset) - 2);
  await expect(
    Math.round(entryOffset(scroller, anchor.id)),
    `${label}: "${anchor.id}" stays where the reader was reading it`,
  ).toBeLessThanOrEqual(Math.round(anchor.offset) + 2);
  await expect(
    distanceFromBottom(scroller),
    `${label}: not pulled back to the latest message`,
  ).toBeGreaterThan(200);
}

/**
 * Waits until the scroll owner's box has not changed for longer than the window in which a scroll
 * is attributed to the layout rather than the reader (`useLayoutInducedScroll`'s 200 ms).
 */
async function scrollOwnerSettled(scroller: HTMLElement, quietMs = 250) {
  let changedAt = performance.now();
  const mark = () => {
    changedAt = performance.now();
  };

  const observer = new ResizeObserver(mark);
  observer.observe(scroller);
  window.addEventListener('resize', mark);
  try {
    await waitFor(
      () => {
        if (performance.now() - changedAt < quietMs) {
          throw new Error('The conversation scroller is still resizing');
        }
      },
      { timeout: 5000 },
    );
  } finally {
    observer.disconnect();
    window.removeEventListener('resize', mark);
  }
}

/** A long conversation on screen, overflowing its scroller and following the latest message. */
async function followingLongConversation(canvasElement: HTMLElement, lastText: string | RegExp) {
  await within(canvasElement).findByText(lastText, undefined, { timeout: 5000 });
  const scroller = await waitFor(() => {
    const node = scrollerOf(canvasElement);
    if (!(node.scrollHeight - node.clientHeight > 1200)) {
      throw new Error('Expected the conversation to overflow its scroller.');
    }

    return node;
  });
  await scrollOwnerSettled(scroller);
  await waitFor(async () =>
    expect(distanceFromBottom(scroller), 'following the latest message').toBeLessThanOrEqual(2),
  );

  return scroller;
}

/** Waits out the pill debounce (a condition, not a sleep): the pill is the settled "away" verdict. */
async function awaySettled(canvasElement: HTMLElement) {
  await waitFor(async () => expect(latestPill(canvasElement)).not.toBeNull());
}

// --- 1. A new message arrives while the reader is scrolling away ---------------------------------

function newMessageWhileScrollingAway(viewport: { width: number; height: number }): Scenario {
  const snapshot = longConversationSnapshot();
  const live = liveFixtureApi(snapshot);

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);
      await live.watched();

      readerScrollsTo(scroller, scroller.scrollTop - 700);
      const anchor = firstVisibleEntry(scroller);
      live.push(nextAnswer(snapshot, 1, 'Nowa odpowiedź, która przyszła w trakcie czytania.'));
      await within(canvasElement).findByText('Nowa odpowiedź, która przyszła w trakcie czytania.');
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'right after the new message');
      await awaySettled(canvasElement);
      await expectReadingPosition(scroller, anchor, 'once away has settled');

      // Back at the bottom the conversation follows again: the next message keeps it pinned.
      readerScrollsTo(scroller, scroller.scrollHeight);
      await waitFor(async () => expect(latestPill(canvasElement)).toBeNull());
      live.push(nextAnswer(snapshot, 2, 'Kolejna odpowiedź, już przy najnowszych wiadomościach.'));
      await within(canvasElement).findByText(
        'Kolejna odpowiedź, już przy najnowszych wiadomościach.',
      );
      await waitFor(async () =>
        expect(distanceFromBottom(scroller), 'following again').toBeLessThanOrEqual(2),
      );
    },
  };
}

export const ScrollPositionNewMessageWhileScrollingAwayStacked: Story = {
  tags: ['contract'],
  ...newMessageWhileScrollingAway(STACKED),
};
export const ScrollPositionNewMessageWhileScrollingAwaySplit: Story = {
  tags: ['contract'],
  ...newMessageWhileScrollingAway(SPLIT),
};

// --- 2. A long message is still being fetched while the reader scrolls away ----------------------

/** `sessionFixture`'s large answer (a preview plus three held pages), placed at `ordinal`. */
function largeAnswer(ordinal: number, turnId: string): ConversationEntry {
  return { ...sessionFixture().entries[1]!, ordinal, turnId };
}

const largeAnswerTail = /jedna całość\.$/;
const largeAnswerPreview = /^To jest krótki podgląd dużej odpowiedzi\./;

function growingMessageWhileReading(
  viewport: { width: number; height: number },
  where: 'latest' | 'above',
): Scenario {
  const snapshot = longConversationSnapshot();
  const newest = snapshot.entries.at(-1)!;
  if (where === 'latest') {
    snapshot.entries.push(largeAnswer(newest.ordinal + 1, newest.turnId));
  } else {
    // Halfway up the conversation: the reader will be reading below it while it grows.
    const middle = snapshot.entries[Math.floor(snapshot.entries.length / 2)]!;
    snapshot.entries = [
      ...snapshot.entries.filter((entry) => entry.ordinal <= middle.ordinal),
      largeAnswer(middle.ordinal + 0.5, middle.turnId),
      ...snapshot.entries.filter((entry) => entry.ordinal > middle.ordinal),
    ];
  }

  const live = liveFixtureApi(snapshot, { holdContent: true });

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(
        canvasElement,
        where === 'latest' ? largeAnswerPreview : longConversationLastMessage,
      );
      const answer = () =>
        scroller.querySelector<HTMLElement>('[data-entry-id="answer"]')!.getBoundingClientRect()
          .height;
      const before = answer();

      if (where === 'latest') {
        readerScrollsTo(scroller, scroller.scrollTop - 700);
      } else {
        // Just below the large answer: it is above the reader's first visible line.
        const entry = scroller.querySelector<HTMLElement>('[data-entry-id="answer"]')!;
        readerScrollsTo(
          scroller,
          scroller.scrollTop +
            entry.getBoundingClientRect().bottom -
            scroller.getBoundingClientRect().top +
            40,
        );
      }

      const anchor = firstVisibleEntry(scroller);
      live.releaseContent();
      await waitFor(async () =>
        expect(answer(), 'the first page grew the answer').toBeGreaterThan(before),
      );
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the first page');
      live.releaseContent();
      live.releaseContent();
      await within(canvasElement).findByText(largeAnswerTail);
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the whole answer');
      await awaySettled(canvasElement);
      await expectReadingPosition(scroller, anchor, 'once away has settled');
    },
  };
}

export const ScrollPositionLatestMessageGrowsWhileReadingStacked: Story = {
  tags: ['contract'],
  ...growingMessageWhileReading(STACKED, 'latest'),
};
export const ScrollPositionLatestMessageGrowsWhileReadingSplit: Story = {
  tags: ['contract'],
  ...growingMessageWhileReading(SPLIT, 'latest'),
};
export const ScrollPositionMessageAboveGrowsWhileReadingStacked: Story = {
  tags: ['contract'],
  ...growingMessageWhileReading(STACKED, 'above'),
};
export const ScrollPositionMessageAboveGrowsWhileReadingSplit: Story = {
  tags: ['contract'],
  ...growingMessageWhileReading(SPLIT, 'above'),
};

// --- 3. The composer changes height while the reader scrolls away --------------------------------

/** Types like a user would, but in one input event, so it lands inside the same task. */
function setDraft(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    textarea,
    value,
  );
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function composerGrowsWhileScrollingAway(viewport: { width: number; height: number }): Scenario {
  const live = liveFixtureApi(longConversationSnapshot());

  return {
    // Its own owner: the draft is kept per owner and Session, so no other story's draft is shown.
    args: { api: live.api, owner: `composer-scroll-story-${viewport.width}` },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);
      const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]')!;
      const composerBefore = overlay.getBoundingClientRect().height;
      const textarea = within(canvasElement).getByLabelText<HTMLTextAreaElement>('Wiadomość');

      readerScrollsTo(scroller, scroller.scrollTop - 700);
      const anchor = firstVisibleEntry(scroller);
      setDraft(textarea, 'Pierwsza linia\nDruga linia\nTrzecia linia\nCzwarta linia');
      await waitFor(async () =>
        expect(
          overlay.getBoundingClientRect().height,
          'the composer grew with the draft',
        ).toBeGreaterThan(composerBefore + 10),
      );
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the composer grew');
      await awaySettled(canvasElement);
      await expectReadingPosition(scroller, anchor, 'once away has settled');

      // Shrinking it again does not move the reader either.
      setDraft(textarea, '');
      await waitFor(async () =>
        expect(overlay.getBoundingClientRect().height).toBeLessThan(composerBefore + 5),
      );
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the composer shrank');
    },
  };
}

export const ScrollPositionComposerGrowsWhileScrollingAwayStacked: Story = {
  tags: ['contract'],
  ...composerGrowsWhileScrollingAway(STACKED),
};
export const ScrollPositionComposerGrowsWhileScrollingAwaySplit: Story = {
  tags: ['contract'],
  ...composerGrowsWhileScrollingAway(SPLIT),
};

// --- 4. Older history loads while a new event arrives --------------------------------------------

function olderHistoryWithNewEvent(viewport: { width: number; height: number }): Scenario {
  const snapshot = longConversationSnapshot();
  snapshot.history = { hasOlder: true, before: 'older' };
  const live = liveFixtureApi(snapshot, { holdHistory: true });

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);
      await live.watched();

      // The reader scrolls up to the start of what is loaded: the older page is requested.
      readerScrollsTo(scroller, 0);
      const anchor = firstVisibleEntry(scroller);
      await waitFor(async () => expect(live.historyReads()).toBe(1));
      await within(canvasElement).findByText('Wczytywanie starszych wiadomości…');
      await expectReadingPosition(scroller, anchor, 'while the older page loads');

      // The older page and a new live message land together.
      live.releaseHistory();
      live.push(nextAnswer(snapshot, 1, 'Nowa odpowiedź razem ze starszą historią.'));
      await within(canvasElement).findByText('Starsza wiadomość');
      // And one more right after the older page landed, before "away" has settled.
      live.push(nextAnswer(snapshot, 2, 'Kolejna odpowiedź tuż po starszej historii.'));
      await within(canvasElement).findByText('Nowa odpowiedź razem ze starszą historią.');
      await within(canvasElement).findByText('Kolejna odpowiedź tuż po starszej historii.');
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the older page and the new message');
      await awaySettled(canvasElement);
      await expectReadingPosition(scroller, anchor, 'once away has settled');
    },
  };
}

export const ScrollPositionOlderHistoryWithNewEventStacked: Story = {
  tags: ['contract'],
  ...olderHistoryWithNewEvent(STACKED),
};
export const ScrollPositionOlderHistoryWithNewEventSplit: Story = {
  tags: ['contract'],
  ...olderHistoryWithNewEvent(SPLIT),
};

// --- 5. The layout switches between split and stacked while the reader reads older content -------

function layoutSwitchWhileReading(
  from: { width: number; height: number },
  to: { width: number; height: number },
): Scenario {
  const live = liveFixtureApi(longConversationSnapshot());

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(from.width, from.height);
      const layoutBefore = document.querySelector('[data-layout]')?.getAttribute('data-layout');
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);
      readerScrollsTo(scroller, Math.round(scroller.scrollHeight / 2));
      await awaySettled(canvasElement);
      const anchor = firstVisibleEntry(scroller);

      await settleViewport(to.width, to.height);
      await waitFor(async () =>
        expect(document.querySelector('[data-layout]')?.getAttribute('data-layout')).not.toBe(
          layoutBefore,
        ),
      );
      const next = scrollerOf(canvasElement);
      await scrollOwnerSettled(next);
      await nextFrames();
      const offset = entryOffset(next, anchor.id);
      await expect(
        offset,
        `"${anchor.id}" (read before the switch) is still on screen near the top`,
      ).toBeGreaterThanOrEqual(-40);
      await expect(offset).toBeLessThan(next.clientHeight / 2);
      await expect(distanceFromBottom(next), 'still reading, not at the latest').toBeGreaterThan(
        300,
      );
      await expect(latestPill(canvasElement), 'the pill is still offered').not.toBeNull();
    },
  };
}

export const ScrollPositionSplitToStackedWhileReading: Story = {
  tags: ['contract'],
  ...layoutSwitchWhileReading(SPLIT, { width: 600, height: 844 }),
};
export const ScrollPositionStackedToSplitWhileReading: Story = {
  tags: ['contract'],
  ...layoutSwitchWhileReading({ width: 600, height: 844 }, SPLIT),
};

// --- 6. Jump to latest after the window became detached ------------------------------------------

/** A full conversation window (200 entries) with one Turn per request/answer pair. */
function windowSnapshot(from: number, to: number, hasOlder: boolean): SessionSnapshot {
  const snapshot = longConversationSnapshot();
  snapshot.entries = [];
  for (let ordinal = from; ordinal <= to; ordinal += 1) {
    const pair = Math.ceil(ordinal / 2);
    snapshot.entries.push({
      id: `window-${ordinal}`,
      turnId: `00000000-0000-4000-8000-${String(pair).padStart(12, '0')}`,
      ordinal,
      revision: 1,
      kind: ordinal % 2 ? 'request' : 'answer',
      createdAt: '2026-10-29T09:00:00Z',
      text: {
        text:
          ordinal % 2
            ? `Pytanie ${ordinal}: czy ta część historii jest już sprawdzona?`
            : `Odpowiedź ${ordinal}: tak, ta część została sprawdzona i opisana w notatkach.`,
        complete: true,
      },
    });
  }

  snapshot.history = hasOlder ? { hasOlder: true, before: `before-${from}` } : { hasOlder: false };

  return snapshot;
}

function jumpToLatestAfterDetached(viewport: { width: number; height: number }): Scenario {
  const first = windowSnapshot(101, 300, true);
  const live = liveFixtureApi(first, {
    holdHistory: true,
    historyPage: (before) => {
      const end = Number(before.replace('before-', '')) - 1;
      const page = windowSnapshot(end - 19, end, true);

      return { ...page, sessionId: fixtureSessionId, eventSeq: first.eventSeq };
    },
    nextSnapshot: () => windowSnapshot(101, 300, true),
  });

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const canvas = within(canvasElement);
      const scroller = await followingLongConversation(
        canvasElement,
        'Odpowiedź 300: tak, ta część została sprawdzona i opisana w notatkach.',
      );

      // Reading at the top: an older page loads and trims the newest entries (detached).
      readerScrollsTo(scroller, 0);
      await waitFor(async () => expect(live.historyReads()).toBe(1));
      live.releaseHistory();
      await canvas.findByText('Pytanie 81: czy ta część historii jest już sprawdzona?');
      await waitFor(async () =>
        expect(
          canvas.queryByText(
            'Odpowiedź 300: tak, ta część została sprawdzona i opisana w notatkach.',
          ),
          'the window no longer reaches the live end',
        ).toBeNull(),
      );
      // Still at the top: the next older page is already on its way when the reader jumps.
      readerScrollsTo(scroller, 0);
      await waitFor(async () => expect(live.historyReads()).toBe(2));

      await userEvent.click(
        await canvas.findByRole('button', { name: 'Wróć do najnowszych wiadomości' }),
      );
      await canvas.findByText(
        'Odpowiedź 300: tak, ta część została sprawdzona i opisana w notatkach.',
      );
      const latest = scrollerOf(canvasElement);
      await waitFor(async () =>
        expect(distanceFromBottom(latest), 'at the latest message').toBeLessThanOrEqual(2),
      );
      await waitFor(async () => expect(latestPill(canvasElement)).toBeNull());
      await expect(live.historyReads(), 'no older page is requested at the live end').toBe(2);

      // And it keeps following: a new message stays pinned.
      await live.watched();
      live.push(nextAnswer(windowSnapshot(101, 300, true), 1, 'Najnowsza odpowiedź po powrocie.'));
      await canvas.findByText('Najnowsza odpowiedź po powrocie.');
      await waitFor(async () =>
        expect(distanceFromBottom(latest), 'still following').toBeLessThanOrEqual(2),
      );
      await expect(latestPill(canvasElement)).toBeNull();
    },
  };
}

export const ScrollPositionJumpToLatestAfterDetachedStacked: Story = {
  tags: ['contract'],
  ...jumpToLatestAfterDetached(STACKED),
};
export const ScrollPositionJumpToLatestAfterDetachedSplit: Story = {
  tags: ['contract'],
  ...jumpToLatestAfterDetached(SPLIT),
};
