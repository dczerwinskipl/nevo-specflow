import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  anchorWorkPages,
  expectRowStays,
  heldHistoryApi,
  historyScroller,
  layoutSettled,
  rowOffset,
  toolAction,
  workItem,
  workItemWithActions,
} from './managedSession.olderPageAnchor.stories-support';
import { fixtureContentRef } from './managedSession.workInspector.stories-support';
import {
  WorkInspectorEnvironment,
  WorkInspectorHost,
  openWork,
} from './managedSession.workInspectorHost.stories-support';

/**
 * Content that grows by itself above the entry being read — a ToolAction's parameters and response
 * arriving after its older page landed, a long Thinking's remaining text — leaves that entry where
 * it is on screen (`usePagedHistoryScroll`, the one owner of the Work and Actions scroll position).
 */
const meta = {
  title: 'SpecFlow/Components/Work Inspector/Reading position',
  component: WorkInspectorHost,
  tags: ['integration'],
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

const READ_ACTION = 'Edit · tail-0.ts';
const olderActions = ['older-0', 'older-1', 'older-2'].map((name) =>
  toolAction(`Edit · ${name}.ts`, 14),
);
const actionsHistory = heldHistoryApi({
  workPages: [[workItemWithActions('Edit workspace (7 files)', 'reading-actions-work', 7)]],
  actionPages: [
    olderActions,
    ['tail-0', 'tail-1', 'tail-2', 'tail-3'].map((name) => toolAction(`Edit · ${name}.ts`)),
  ],
  heldContent: new Set(
    olderActions.flatMap((action) => [action.input!.contentId, action.output!.contentId]),
  ),
});

/** The older actions land above the read action, then their parameters and responses arrive. */
export const OlderActionsContentArrivesAboveTheReader: Story = {
  args: { api: actionsHistory.api },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /Edit workspace \(7 files\)/ }),
    );
    await canvas.findByText(READ_ACTION);
    await waitFor(() => {
      if (actionsHistory.older.pending() !== 1) {
        throw new Error('Expected the older actions to be in flight.');
      }
    });
    const scroller = historyScroller(canvasElement);
    await layoutSettled(scroller);

    actionsHistory.older.release();
    await within(scroller).findByText('Edit · older-0.ts');
    await waitFor(() => {
      if (actionsHistory.content.pending() !== olderActions.length * 2) {
        throw new Error('Expected every older action content to be in flight.');
      }
    });
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ACTION);

    actionsHistory.content.release();
    await within(scroller).findByText(/older-0\.ts output line 14/);
    await expectRowStays(scroller, READ_ACTION, offset, 'older contents arrived above');
  },
};

const READ_ROW = 'Reading read keep.ts';
const THINKING = `Reading thinking: ${'Comparing the admission check with the revision reload, line by line. '.repeat(60)}`;
const PREVIEW = THINKING.slice(0, 400);
const thinkingContent = fixtureContentRef(THINKING);
const workHistory = heldHistoryApi({
  workPages: [
    [
      workItem('tool', 'Reading first.ts'),
      workItem('reasoning', PREVIEW, {
        title: { text: PREVIEW, complete: false, content: thinkingContent },
      }),
      workItem('tool', READ_ROW),
      ...Array.from({ length: 40 }, (_, index) =>
        index % 2 === 0
          ? workItem('interaction', `Reading confirm ${index}`)
          : workItem('tool', `Reading tool ${index}.ts`),
      ),
    ],
  ],
  heldContent: new Set([thinkingContent.contentId]),
});

/** A long Thinking the reader expanded, then scrolled past, receives its remaining text. */
export const ThinkingGrowsAboveTheReader: Story = {
  args: { api: workHistory.api },
  play: async ({ canvasElement }) => {
    await openWork(canvasElement);
    const scroller = historyScroller(canvasElement);
    await userEvent.click(await within(scroller).findByRole('button', { name: 'Pokaż więcej' }));
    await waitFor(() => {
      if (workHistory.content.pending() !== 1) {
        throw new Error("Expected the Thinking's remaining text to be in flight.");
      }
    });
    await layoutSettled(scroller);
    scroller.scrollTop += rowOffset(scroller, READ_ROW) - 24;
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ROW);

    workHistory.content.release();
    await waitFor(() => {
      const text = within(scroller).getByText(/^Reading thinking:/).textContent ?? '';
      if (text.length < THINKING.trim().length) {
        throw new Error("Expected the Thinking's full text.");
      }
    });
    await expectRowStays(scroller, READ_ROW, offset, 'Thinking grew above');
  },
};

const topHistory = heldHistoryApi({ workPages: anchorWorkPages() });

/** At the top edge the list's own loading indicator pushes the list down instead of being kept out
 * of view above it: the reader at the top sees that older history is loading. */
export const LoadingIndicatorShowsAtTheTop: Story = {
  args: { api: topHistory.api },
  play: async ({ canvasElement }) => {
    await openWork(canvasElement);
    const scroller = historyScroller(canvasElement);
    await waitFor(() => {
      if (topHistory.older.pending() !== 1) {
        throw new Error('Expected the older Work request to be in flight.');
      }
    });
    const indicator = await within(scroller).findByText('Wczytywanie starszej historii pracy…');
    await layoutSettled(scroller);

    await expect(scroller.scrollTop).toBe(0);
    await expect(
      indicator.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(0);
  },
};
