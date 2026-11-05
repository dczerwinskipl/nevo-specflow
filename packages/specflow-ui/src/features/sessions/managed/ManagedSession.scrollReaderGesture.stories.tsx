import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import {
  longConversationLastMessage,
  longConversationSnapshot,
} from './managedSession.fullSession.stories-support';
import { liveFixtureApi, nextAnswer } from './managedSession.liveFeed.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import { Environment } from './managedSession.storyHelpers.stories-support';
import {
  awaySettled,
  distanceFromBottom,
  expectReadingPosition,
  firstVisibleEntry,
  followingLongConversation,
  nextFrames,
  SPLIT,
  STACKED,
} from './managedSession.scrollPosition.stories-support';

/**
 * The reader's own gesture is never undone by a change racing it (`useConversationScroll`): a
 * wheel arriving moments after the scroller was resized (a dragged splitter or window edge, a soft
 * keyboard animating) leaves the latest message and starts reading, exactly as on a quiet layout
 * (`useLayoutInducedScroll` recognises the reader's gesture by its input, however recent the
 * resize was); and a new message that commits after the view moved but before the browser
 * delivered that scroll's event keeps the reader where they scrolled to. Same title as the other
 * Managed Session groups; hidden `contract`.
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
    owner: 'scroll-reader-gesture-story',
    api: liveFixtureApi(longConversationSnapshot()).api,
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;
type Scenario = Pick<Story, 'args' | 'play'>;

const clientBox = (node: HTMLElement) => `${node.clientWidth}x${node.clientHeight}`;

/**
 * Re-lays the scroller out on every frame, the way a dragged Secondary splitter, a window edge
 * being dragged or a soft keyboard animating in does: its content box changes width by a pixel
 * each frame. And the instant the reader's wheel turns, its box loses a pixel of height as well,
 * so the browser delivers that wheel's scroll to a scroller re-laid out since the last scroll it
 * saw — the layout change racing the gesture however long the runner's frames are (a resize paced
 * by frames alone races it only while frames are shorter than the 200 ms layout window).
 */
function keepResizing(scroller: HTMLElement) {
  const original = {
    paddingRight: scroller.style.paddingRight,
    maxHeight: scroller.style.maxHeight,
  };
  const base = parseFloat(getComputedStyle(scroller).paddingRight) || 0;
  let resized = false;
  let frame = 0;
  let odd = false;
  // The client box the wheel's resize started from, and the one its scroll was delivered with.
  let wheelBox: string | undefined;
  let scrollBox: string | undefined;
  const observer = new ResizeObserver(() => {
    resized = true;
  });
  observer.observe(scroller);
  const tick = () => {
    odd = !odd;
    scroller.style.paddingRight = `${base + (odd ? 1 : 0)}px`;
    frame = requestAnimationFrame(tick);
  };

  const onWheel = () => {
    if (wheelBox === undefined) {
      wheelBox = clientBox(scroller);
      scroller.style.maxHeight = `${scroller.getBoundingClientRect().height - 1}px`;
    }
  };

  const onScroll = () => {
    if (wheelBox !== undefined && scrollBox === undefined) {
      scrollBox = clientBox(scroller);
    }
  };

  frame = requestAnimationFrame(tick);
  scroller.addEventListener('wheel', onWheel, { passive: true });
  scroller.addEventListener('scroll', onScroll, { passive: true });

  return {
    resized: () => resized,
    /** The wheel's scroll reached the page with the scroller's box changed since the wheel. */
    scrolledResized: () => scrollBox !== undefined && scrollBox !== wheelBox,
    stop() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('scroll', onScroll);
      scroller.style.paddingRight = original.paddingRight;
      scroller.style.maxHeight = original.maxHeight;
    },
  };
}

/**
 * The reader turns the wheel up, as the page sees it: a `wheel` event on the scroller, the view
 * moving by its delta, and that move's `scroll` event delivered by the browser with the next frame.
 * Dispatched in the page rather than through the runner's browser driver, whose round trip (its
 * pointer actionability checks over the browser connection every running story shares) took from a
 * fraction of a second to over ten seconds in the full suite, so the story's duration followed the
 * machine's load instead of the behaviour.
 */
function readerWheelsUp(scroller: HTMLElement, distance: number) {
  scroller.dispatchEvent(
    new WheelEvent('wheel', { deltaY: -distance, bubbles: true, cancelable: true }),
  );
  scroller.scrollTop -= distance;
}

function wheelWhileLayoutChanges(viewport: { width: number; height: number }): Scenario {
  return {
    args: { api: liveFixtureApi(longConversationSnapshot()).api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);

      const resizing = keepResizing(scroller);
      try {
        await waitFor(() => {
          if (!resizing.resized()) {
            throw new Error('The scroller is not being re-laid out yet.');
          }
        });
        // While the layout keeps changing, the reader scrolls up with the wheel.
        readerWheelsUp(scroller, 600);
        await nextFrames();
        await expect(
          resizing.scrolledResized(),
          "the wheel's scroll reached the page with the scroller just re-laid out (the race this story is about)",
        ).toBe(true);
        await expect(
          distanceFromBottom(scroller),
          "the reader's wheel scrolled the conversation up (not undone by the re-layout)",
        ).toBeGreaterThan(300);
        // The layout keeps changing for a while after the gesture: each re-layout re-applies the
        // position, which must now keep the reader where they scrolled to.
        for (let frame = 0; frame < 10; frame += 1) {
          await nextFrames();
        }

        await expect(
          distanceFromBottom(scroller),
          'the re-layouts after the gesture keep the reader where they scrolled to',
        ).toBeGreaterThan(300);
      } finally {
        resizing.stop();
      }

      // The reader is reading: "Jump to latest" is offered once scrolling pauses (its debounce
      // waits for the re-layouts' own position corrections to stop too), and the settled layout
      // keeps them where they are instead of pinning them to the bottom.
      await awaySettled(canvasElement);
      await settleViewport(viewport.width, viewport.height);
      await expect(
        distanceFromBottom(scroller),
        'the settled layout does not pull the reader back to the latest message',
      ).toBeGreaterThan(300);
    },
  };
}

export const ScrollPositionWheelWhileLayoutChangesStacked: Story = {
  tags: ['contract'],
  ...wheelWhileLayoutChanges(STACKED),
};
export const ScrollPositionWheelWhileLayoutChangesSplit: Story = {
  tags: ['contract'],
  ...wheelWhileLayoutChanges(SPLIT),
};

// --- A new message commits before the browser delivers the reader's scroll event -----------------

const RACING_ANSWER = 'Nowa odpowiedź, zanim przeglądarka zgłosiła przewinięcie.';

function messageBeforeScrollEvent(viewport: { width: number; height: number }): Scenario {
  const snapshot = longConversationSnapshot();
  const live = liveFixtureApi(snapshot);

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);
      await live.watched();

      let messageBeforeEvent: boolean | undefined;
      scroller.addEventListener(
        'scroll',
        () => {
          messageBeforeEvent = Boolean(scroller.querySelector('[data-entry-id="live-answer-1"]'));
        },
        { once: true },
      );
      // The view moves now and the browser delivers its `scroll` event with the next frame, as
      // for a wheel or touch scroll; the live message is committed before that frame.
      scroller.scrollTop -= 700;
      const anchor = firstVisibleEntry(scroller);
      live.push(nextAnswer(snapshot, 1, RACING_ANSWER));
      await within(canvasElement).findByText(RACING_ANSWER);
      await nextFrames();
      await expect(
        messageBeforeEvent,
        "the message rendered before the reader's scroll event (the race this story is about)",
      ).toBe(true);
      await expectReadingPosition(scroller, anchor, 'after the message that landed first');
      await awaySettled(canvasElement);
      await expectReadingPosition(scroller, anchor, 'once away has settled');
    },
  };
}

export const ScrollPositionMessageBeforeScrollEventStacked: Story = {
  tags: ['contract'],
  ...messageBeforeScrollEvent(STACKED),
};
export const ScrollPositionMessageBeforeScrollEventSplit: Story = {
  tags: ['contract'],
  ...messageBeforeScrollEvent(SPLIT),
};
