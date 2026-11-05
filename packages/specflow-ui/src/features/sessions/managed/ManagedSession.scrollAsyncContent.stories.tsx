import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { ConversationEntry } from '@nevo/specflow-contracts/sessions';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import { longConversationSnapshot } from './managedSession.fullSession.stories-support';
import { liveFixtureApi } from './managedSession.liveFeed.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import { Environment } from './managedSession.storyHelpers.stories-support';
import {
  awaySettled,
  distanceFromBottom,
  expectReadingPosition,
  firstVisibleEntry,
  followingLongConversation,
  latestPill,
  nextFrames,
  readerScrollsTo,
  SPLIT,
  STACKED,
} from './managedSession.scrollPosition.stories-support';

/**
 * Where the conversation stays when content grows on its own, after it was rendered: a Markdown
 * image in an answer finishes loading with no new message, no re-render of the screen and no
 * resize of the scroller (`conversation/useConversationScroll.ts` observes the content itself).
 * Following keeps the latest message pinned; a reader above it keeps the entry they were reading.
 * Same title as the other Managed Session groups; hidden `contract`.
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
    owner: 'scroll-async-content-story',
    api: liveFixtureApi(longConversationSnapshot()).api,
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;
type Scenario = Pick<Story, 'args' | 'play'>;

const IMAGE_ALT = 'Schemat przepływu admission';
const IMAGE_ANSWER_TEXT = 'Poniżej schemat przepływu, o który pytałeś.';
/** A 4:3 diagram: wide enough to scale to the column, so its loaded height is well over 200px. */
const LOADED_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<rect width="640" height="480" fill="#d0d7de"/></svg>',
  );

function imageAnswer(id: string, after: ConversationEntry): ConversationEntry {
  return {
    id,
    turnId: after.turnId,
    ordinal: after.ordinal + 0.5,
    revision: 1,
    kind: 'answer',
    createdAt: after.createdAt,
    // Not resolvable by the story server: the image stays unloaded until the play delivers it.
    text: {
      text: `${IMAGE_ANSWER_TEXT}\n\n![${IMAGE_ALT}](scroll-story-pending-diagram.svg)`,
      complete: true,
    },
  };
}

/** The Markdown image of `entryId`, once the browser gave up on its pending source. */
async function pendingImage(scroller: HTMLElement, entryId: string) {
  return waitFor(() => {
    const image = scroller.querySelector<HTMLImageElement>(
      `[data-entry-id="${CSS.escape(entryId)}"] img[alt="${IMAGE_ALT}"]`,
    );
    if (!image?.complete) {
      throw new Error('Expected the Markdown image to be rendered and not loading.');
    }

    return image;
  });
}

/**
 * The image's data arrives late (the network, an expiring signed URL being re-fetched): the
 * browser decodes it and re-lays the answer out with nothing on the React side changing. With
 * `scrollEventInFlight`, a `scroll` event the browser queued earlier (for a position the screen
 * itself had just written) is delivered in the same task as the load, before anything re-applied
 * the position: it reports no movement of the view, only the content that moved under it.
 */
async function imageLoads(image: HTMLImageElement, scrollEventInFlight?: HTMLElement) {
  const before = image.getBoundingClientRect().height;
  if (scrollEventInFlight) {
    image.addEventListener('load', () => scrollEventInFlight.dispatchEvent(new Event('scroll')), {
      once: true,
    });
  }

  const loaded = new Promise<void>((resolve) =>
    image.addEventListener('load', () => resolve(), { once: true }),
  );
  image.src = LOADED_IMAGE;
  await loaded;
  await waitFor(async () =>
    expect(
      image.getBoundingClientRect().height,
      'the loaded image grew the answer',
    ).toBeGreaterThan(before + 150),
  );
}

function imageLoadsAboveWhileReading(
  viewport: { width: number; height: number },
  scrollEventInFlight = false,
): Scenario {
  const snapshot = longConversationSnapshot();
  const middle = snapshot.entries[Math.floor(snapshot.entries.length / 2)]!;
  const image = imageAnswer('image-answer', middle);
  snapshot.entries = [
    ...snapshot.entries.filter((entry) => entry.ordinal <= middle.ordinal),
    image,
    ...snapshot.entries.filter((entry) => entry.ordinal > middle.ordinal),
  ];
  const live = liveFixtureApi(snapshot);

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const lastText = snapshot.entries.at(-1)!.text.text;
      const scroller = await followingLongConversation(canvasElement, lastText);
      const pending = await pendingImage(scroller, image.id);

      // The reader reads just below the answer with the image: it is above their first line.
      const entry = scroller.querySelector<HTMLElement>(`[data-entry-id="${image.id}"]`)!;
      readerScrollsTo(
        scroller,
        scroller.scrollTop +
          entry.getBoundingClientRect().bottom -
          scroller.getBoundingClientRect().top +
          40,
      );
      await awaySettled(canvasElement);
      const anchor = firstVisibleEntry(scroller);

      await imageLoads(pending, scrollEventInFlight ? scroller : undefined);
      await nextFrames();
      await expectReadingPosition(scroller, anchor, 'after the image above loaded');
      await expect(latestPill(canvasElement), 'still reading: the pill stays').not.toBeNull();
    },
  };
}

export const ScrollPositionImageLoadsAboveWhileReadingStacked: Story = {
  tags: ['contract'],
  ...imageLoadsAboveWhileReading(STACKED),
};
export const ScrollPositionImageLoadsAboveWhileReadingSplit: Story = {
  tags: ['contract'],
  ...imageLoadsAboveWhileReading(SPLIT),
};
export const ScrollPositionImageLoadsAboveWithScrollEventInFlightStacked: Story = {
  tags: ['contract'],
  ...imageLoadsAboveWhileReading(STACKED, true),
};
export const ScrollPositionImageLoadsAboveWithScrollEventInFlightSplit: Story = {
  tags: ['contract'],
  ...imageLoadsAboveWhileReading(SPLIT, true),
};

function imageLoadsWhileFollowing(
  viewport: { width: number; height: number },
  scrollEventInFlight = false,
): Scenario {
  const snapshot = longConversationSnapshot();
  const image = imageAnswer('image-answer', snapshot.entries.at(-1)!);
  snapshot.entries.push(image);
  const live = liveFixtureApi(snapshot);

  return {
    args: { api: live.api },
    play: async ({ canvasElement }) => {
      await settleViewport(viewport.width, viewport.height);
      const scroller = await followingLongConversation(canvasElement, IMAGE_ANSWER_TEXT);
      const pending = await pendingImage(scroller, image.id);

      await imageLoads(pending, scrollEventInFlight ? scroller : undefined);
      await nextFrames();
      await expect(
        distanceFromBottom(scroller),
        'following: the grown latest message stays pinned to the bottom',
      ).toBeLessThanOrEqual(2);
      await expect(latestPill(canvasElement), 'still following: no pill').toBeNull();
    },
  };
}

export const ScrollPositionImageLoadsWhileFollowingStacked: Story = {
  tags: ['contract'],
  ...imageLoadsWhileFollowing(STACKED),
};
export const ScrollPositionImageLoadsWhileFollowingSplit: Story = {
  tags: ['contract'],
  ...imageLoadsWhileFollowing(SPLIT),
};
export const ScrollPositionImageLoadsWhileFollowingWithScrollEventInFlightStacked: Story = {
  tags: ['contract'],
  ...imageLoadsWhileFollowing(STACKED, true),
};
export const ScrollPositionImageLoadsWhileFollowingWithScrollEventInFlightSplit: Story = {
  tags: ['contract'],
  ...imageLoadsWhileFollowing(SPLIT, true),
};
