import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  richDefaultApi,
} from './managedSession.fullSession.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import { Environment } from './managedSession.storyHelpers.stories-support';

/**
 * The composed Session screen's Primary layout in the band the shell hint and the resolved layout
 * disagree on (workspace-dynamic-split.md "Resolved layout vs shell capability"): a `split="dynamic"`
 * workspace splits a runtime Secondary from 730px (400 + 330), while `useWorkspaceCapabilities()`
 * switches at 840px. At 780px with Work history or the runtime Context open the conversation must
 * behave as the split layout it really is: a scroll owner exists and scrolls, and the composer and
 * the "jump to latest" pill stay inside Primary instead of spanning over the Secondary. A second
 * group covers the stacked layout's bottom anchor when its scroller shrinks while pinned. Same title
 * as the other Managed Session groups; hidden `contract`.
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
    owner: 'layout-story',
    api: richDefaultApi(),
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

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

const layoutOf = () => document.querySelector('[data-layout]')?.getAttribute('data-layout');

async function waitForConversation(canvasElement: HTMLElement) {
  await waitFor(async () => {
    await expect(
      canvasElement.querySelector('[data-composer-overlay]'),
      'composer mounted',
    ).not.toBeNull();
    await expect(
      canvasElement.querySelectorAll('[data-workspace-surface="primary"] [data-entry-id]').length,
    ).toBeGreaterThan(2);
  });
  await nextFrames();
}

/** The last conversation entry, the composer and (when shown) the pill, in screen space. */
function conversationBounds(canvasElement: HTMLElement) {
  const primary = canvasElement.querySelector<HTMLElement>('[data-workspace-surface="primary"]')!;
  const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]')!;
  const entries = primary.querySelectorAll<HTMLElement>('[data-entry-id]');
  const pill = canvasElement.querySelector<HTMLElement>('.workspace-floating-pill');

  return {
    primary: primary.getBoundingClientRect(),
    overlay: overlay.getBoundingClientRect(),
    pill: pill?.getBoundingClientRect(),
    last: entries[entries.length - 1]!.getBoundingClientRect(),
  };
}

async function expectInside(inner: DOMRect, outer: DOMRect, name: string) {
  await expect(inner.left, `${name} left edge inside Primary`).toBeGreaterThanOrEqual(
    outer.left - 1,
  );
  await expect(inner.right, `${name} right edge inside Primary`).toBeLessThanOrEqual(
    outer.right + 1,
  );
}

/**
 * Waits until the scroll owner's box has not changed for longer than the window in which the screen
 * attributes a scroll to the layout instead of the reader (`useLayoutInducedScroll`'s 200 ms). A
 * Split that just mounted its own scroller is still resizing; a single synthetic scroll inside that
 * window is, by design, not a reader leaving the bottom, and the next pin brings it back (seen on a
 * slow CI runner: `expected 0 to be greater than 100`). A real reader is simulated only once the
 * layout is quiet.
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

/** What a split-layout conversation must satisfy: owned scroll, scrolls, nothing spans the Secondary. */
async function verifySplitConversation(canvasElement: HTMLElement) {
  await waitFor(async () => expect(layoutOf()).toBe('split'));
  const scroller = scrollerOf(canvasElement);
  await expect(
    scroller.className.includes('mobile-workspace-scroll'),
    'a split layout owns its scroller locally, not through the ambient stacked viewport',
  ).toBe(false);
  await expect(scroller.scrollHeight, 'the conversation overflows').toBeGreaterThan(
    scroller.clientHeight + 100,
  );

  // It actually scrolls: a programmatic move up from the bottom sticks.
  await scrollOwnerSettled(scroller);
  scroller.scrollTop = scroller.scrollHeight;
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  await nextFrames();
  scroller.scrollTop = Math.max(0, scroller.scrollTop - 300);
  await nextFrames();
  await expect(
    distanceFromBottom(scroller),
    'the conversation scrolls away from the bottom',
  ).toBeGreaterThan(100);
  // The jump pill is offered once scrolled away; it must stay inside Primary like the composer.
  await waitFor(
    async () =>
      await expect(
        canvasElement.querySelector('.workspace-floating-pill'),
        'jump pill shown when scrolled away',
      ).not.toBeNull(),
  );

  const bounds = conversationBounds(canvasElement);
  await expect(
    getComputedStyle(canvasElement.querySelector('[data-composer-overlay]')!).position,
  ).toBe('sticky');
  await expectInside(bounds.overlay, bounds.primary, 'composer');
  if (bounds.pill) {
    await expectInside(bounds.pill, bounds.primary, 'jump pill');
  }

  // Back at the bottom the last message clears the composer.
  scroller.scrollTop = scroller.scrollHeight;
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  await waitFor(async () => {
    const { last, overlay } = conversationBounds(canvasElement);
    await expect(last.bottom).toBeLessThanOrEqual(overlay.top + 1);
  });
}

async function openLastWork(canvasElement: HTMLElement) {
  await waitFor(
    async () =>
      await expect(canvasElement.querySelectorAll('[data-work-block]').length).toBeGreaterThan(0),
  );
  const buttons = canvasElement.querySelectorAll<HTMLElement>('[data-work-block] button');
  await userEvent.click(buttons[buttons.length - 1]!);
  await waitFor(
    async () =>
      await expect(
        [...canvasElement.querySelectorAll('[data-workspace-surface="secondary"]')].some(
          (region) => region.getBoundingClientRect().width > 0,
        ),
        'Secondary region shown',
      ).toBe(true),
  );
}

export const SplitAt780WithWorkOpen: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(780, 844);
    await waitForConversation(canvasElement);
    await openLastWork(canvasElement);
    await settleViewport(780, 844);
    await verifySplitConversation(canvasElement);
  },
};

/** A conversation shorter than the viewport keeps the split layout's composer at the bottom. */
export const SplitShortConversationComposerAtBottom: Story = {
  tags: ['contract'],
  args: { api: fixtureApi(genericSpecLevelSnapshot()) },
  play: async ({ canvasElement }) => {
    await settleViewport(1280, 655);
    await waitFor(async () => {
      await expect(layoutOf()).toBe('split');
      await expect(canvasElement.querySelector('[data-composer-overlay]')).not.toBeNull();
    });
    await nextFrames();
    const scroller = scrollerOf(canvasElement);
    await expect(scroller.scrollHeight, 'the conversation does not overflow').toBeLessThanOrEqual(
      scroller.clientHeight,
    );
    // Docked where a long conversation pins it: its own sticky `bottom` offset above the edge.
    const overlay = canvasElement.querySelector<HTMLElement>('[data-composer-overlay]')!;
    const stickyOffset = parseFloat(getComputedStyle(overlay).bottom);
    await expect(
      Math.abs(
        scroller.getBoundingClientRect().bottom -
          stickyOffset -
          overlay.getBoundingClientRect().bottom,
      ),
      'composer docked to the bottom of the conversation',
    ).toBeLessThanOrEqual(1);
  },
};

/**
 * With a fine pointer: an answer's actions are always visible in a row under it; the user's bubble
 * reserves no row, and its actions appear in the corner toolbar only on hover or focus.
 */
export const MessageActionsWithFinePointer: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(1280, 800);
    await waitForConversation(canvasElement);
    const primary = canvasElement.querySelector<HTMLElement>('[data-workspace-surface="primary"]')!;
    const answer = [...primary.querySelectorAll<HTMLElement>('article:not(.justify-end)')].find(
      (article) => article.querySelector(':scope > [data-message-actions]'),
    )!;
    await expect(
      getComputedStyle(answer.querySelector('[data-message-actions]')!).opacity,
      'answer actions always visible',
    ).toBe('1');

    const request = primary.querySelector<HTMLElement>('article.justify-end')!;
    const bubble = request.querySelector<HTMLElement>('.rounded-composite')!;
    await expect(
      Math.round(request.getBoundingClientRect().height),
      'the user bubble reserves no actions row',
    ).toBe(Math.round(bubble.getBoundingClientRect().height));
    const toolbar = request.querySelector<HTMLElement>('[data-message-actions]')!;
    await expect(getComputedStyle(toolbar).opacity, 'hidden until hover or focus').toBe('0');
    // CSS `:hover` needs a real pointer; focus reveals it through the same group rule.
    toolbar.querySelector('button')!.focus();
    await waitFor(async () => expect(getComputedStyle(toolbar).opacity).toBe('1'));
  },
};

export const SplitAt780WithRuntimeContext: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(780, 844);
    await waitForConversation(canvasElement);
    // Below 840 Context is not a pinned tab: the header action opens it as a runtime flow.
    // The collapsing header is covered (inert) while the conversation is pinned at the bottom.
    const scroller = scrollerOf(canvasElement);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Kontekst' }));
    await waitFor(
      async () =>
        await expect(
          canvasElement.querySelector('[data-workspace-surface="secondary"]'),
        ).not.toBeNull(),
    );
    await settleViewport(780, 844);
    await verifySplitConversation(canvasElement);
  },
};

export const StackedKeepsBottomAnchorWhenScrollerShrinks: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(780, 844);
    await waitForConversation(canvasElement);
    // Primary only at 780: stacked (nothing to split with), conversation pinned to the bottom.
    await expect(layoutOf()).toBe('stacked');
    const pin = async (label: string) => {
      await waitFor(async () => {
        const scroller = scrollerOf(canvasElement);
        await expect(
          distanceFromBottom(scroller),
          `${label}: still pinned to the bottom (scrollHeight ${scroller.scrollHeight}, clientHeight ${scroller.clientHeight}, scrollTop ${Math.round(scroller.scrollTop)}, innerWidth ${window.innerWidth})`,
        ).toBeLessThanOrEqual(2);
        const { last, overlay } = conversationBounds(canvasElement);
        await expect(
          last.bottom,
          `${label}: the last message clears the composer`,
        ).toBeLessThanOrEqual(overlay.top + 1);
      });
    };

    await pin('780x844');

    await settleViewport(390, 844);
    await pin('780 -> 390 wide');
    await settleViewport(390, 500);
    await pin('390 height 844 -> 500');
    await settleViewport(430, 844);
    await pin('390 -> 430');
    await settleViewport(375, 844);
    await pin('430 -> 375');
  },
};

export const StackedScrolledAwayIsNotPulledBack: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    await waitForConversation(canvasElement);
    const scroller = scrollerOf(canvasElement);
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await nextFrames();
    scroller.scrollTop = Math.max(0, scroller.scrollTop - 700);
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    // Outlasts the feed's own away debounce so both signals agree before the resize.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const awayBefore = distanceFromBottom(scroller);
    await expect(awayBefore).toBeGreaterThan(300);

    await settleViewport(390, 600);
    await new Promise((resolve) => setTimeout(resolve, 250));

    await expect(
      distanceFromBottom(scrollerOf(canvasElement)),
      'a reader who scrolled away stays away when the viewport changes',
    ).toBeGreaterThan(300);
  },
};
