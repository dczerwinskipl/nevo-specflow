import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import { richDefaultApi } from './managedSession.fullSession.stories-support';
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
