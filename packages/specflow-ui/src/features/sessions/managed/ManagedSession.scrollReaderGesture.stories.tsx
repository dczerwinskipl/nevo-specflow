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
  readerScrollsTo,
  SPLIT,
  STACKED,
} from './managedSession.scrollPosition.stories-support';

/**
 * The reader's own gesture is never undone by a change racing it (`useConversationScroll`): a real
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

/**
 * Re-lays the scroller out on every frame, the way a dragged Secondary splitter, a window edge
 * being dragged or a soft keyboard animating in does: its content box changes width by a pixel
 * each frame. Returns how to stop it and when the scroller was last resized.
 */
function keepResizing(scroller: HTMLElement) {
  const original = scroller.style.paddingRight;
  const base = parseFloat(getComputedStyle(scroller).paddingRight) || 0;
  let lastResizeAt = Number.NaN;
  let frame = 0;
  let odd = false;
  const observer = new ResizeObserver(() => {
    lastResizeAt = performance.now();
  });
  observer.observe(scroller);
  const tick = () => {
    odd = !odd;
    scroller.style.paddingRight = `${base + (odd ? 1 : 0)}px`;
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  return {
    lastResizeAt: () => lastResizeAt,
    stop() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.style.paddingRight = original;
    },
  };
}

function wheelWhileLayoutChanges(viewport: { width: number; height: number }): Scenario {
  return {
    args: { api: liveFixtureApi(longConversationSnapshot()).api },
    play: async ({ canvasElement }) => {
      // Lazy: story modules are also loaded in plain Node, where `vitest/browser` throws.
      const { userEvent } = await import('vitest/browser');
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, longConversationLastMessage);

      let wheelAt = Number.NaN;
      let resizeBeforeWheelAt = Number.NaN;
      const resizing = keepResizing(scroller);
      const onWheel = () => {
        if (Number.isNaN(wheelAt)) {
          wheelAt = performance.now();
          resizeBeforeWheelAt = resizing.lastResizeAt();
        }
      };

      scroller.addEventListener('wheel', onWheel, { passive: true });
      try {
        await waitFor(() => {
          if (Number.isNaN(resizing.lastResizeAt())) {
            throw new Error('The scroller is not being re-laid out yet.');
          }
        });
        // While the layout keeps changing, the reader scrolls up with the wheel. A loaded runner can
        // stretch a frame past the layout window (then the gesture is not the one this story is
        // about): the reader returns to the bottom and scrolls again, a few times at most.
        for (let attempt = 1; ; attempt += 1) {
          wheelAt = Number.NaN;
          await userEvent.wheel(scroller, { delta: { y: -600 } });
          await waitFor(async () =>
            expect(
              distanceFromBottom(scroller),
              "the reader's wheel scrolled the conversation up (not undone by the re-layout)",
            ).toBeGreaterThan(300),
          );
          if (wheelAt - resizeBeforeWheelAt < 200 || attempt === 3) {
            break;
          }

          readerScrollsTo(scroller, scroller.scrollHeight);
          await waitFor(async () => expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2));
        }

        await expect(
          wheelAt - resizeBeforeWheelAt,
          'the reader scrolled right after a resize (the gesture this story is about)',
        ).toBeLessThan(200);
        // The layout keeps changing for a while after the gesture: each re-layout re-applies the
        // position, which must now keep the reader where they scrolled to.
        for (let frame = 0; frame < 10; frame += 1) {
          await nextFrames();
        }
      } finally {
        scroller.removeEventListener('wheel', onWheel);
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
