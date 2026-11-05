import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, waitFor, within } from 'storybook/test';
import {
  GROUP_TRIGGER,
  OLDER_ROW,
  READ_ROW,
  anchorWorkPages,
  expectRowStays,
  firstVisibleRowTitle,
  heldHistoryApi,
  historyScroller,
  layoutSettled,
  rowOffset,
  toolAction,
  workItemWithActions,
} from './managedSession.olderPageAnchor.stories-support';
import {
  WorkInspectorEnvironment,
  WorkInspectorHost,
  openWork,
} from './managedSession.workInspectorHost.stories-support';

/**
 * An older Work/ToolAction page lands under the reader (`usePagedHistory`): whatever else changed
 * in the list while the request was in flight — a group expanded or collapsed, a search narrowed
 * it, a tool's content arrived — the entry being read stays where it is on screen, and only the
 * page itself is added above it.
 */
const meta = {
  title: 'SpecFlow/Components/Work Inspector/Older page anchoring',
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

/** Opens Work and waits for the tail and for the older request it starts at the top. */
async function workLoadingOlder(canvasElement: HTMLElement, older: { pending: () => number }) {
  await openWork(canvasElement);
  await within(canvasElement).findByText(READ_ROW);
  await waitFor(() => {
    if (older.pending() !== 1) {
      throw new Error('Expected the older Work request to be in flight.');
    }
  });

  return historyScroller(canvasElement);
}

const plainHistory = heldHistoryApi({ workPages: anchorWorkPages() });

/** Nothing else changes while the older page loads: it is added above the read row. */
export const OlderPageLandsAboveTheReader: Story = {
  args: { api: plainHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await workLoadingOlder(canvasElement, plainHistory.older);
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ROW);

    plainHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await expectRowStays(scroller, READ_ROW, offset, 'older page landed');
  },
};

const expandHistory = heldHistoryApi({ workPages: anchorWorkPages() });

/** Long Thinking under the read row is expanded ("Show more") while the older page loads: it grows
 * the list by many lines, but below the reader, so the read row must not move when the page lands. */
export const ExpandDuringOlderLoad: Story = {
  args: { api: expandHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await workLoadingOlder(canvasElement, expandHistory.older);
    await userEvent.click(within(scroller).getByRole('button', { name: 'Pokaż więcej' }));
    await within(scroller).findByRole('button', { name: 'Pokaż mniej' });
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ROW);

    expandHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await expectRowStays(scroller, READ_ROW, offset, 'Thinking expanded during the older load');
  },
};

const collapseHistory = heldHistoryApi({ workPages: anchorWorkPages(), failFirstOlder: true });

/** The group was expanded before the request (a retry after a failed older load) and is collapsed
 * while it is in flight: the list shrinks below the reader, and the read row must not move. */
export const CollapseDuringOlderLoad: Story = {
  args: { api: collapseHistory.api },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    const retry = await canvas.findByRole('button', { name: 'Spróbuj ponownie' });
    const scroller = historyScroller(canvasElement);
    await userEvent.click(within(scroller).getByRole('button', { name: GROUP_TRIGGER }));
    await within(scroller).findByText('Tail scan drop-module-0.ts');
    await layoutSettled(scroller);

    await userEvent.click(retry);
    await waitFor(() => {
      if (collapseHistory.older.pending() !== 1) {
        throw new Error('Expected the retried older Work request to be in flight.');
      }
    });
    await userEvent.click(within(scroller).getByRole('button', { name: GROUP_TRIGGER }));
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ROW);

    collapseHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await expectRowStays(scroller, READ_ROW, offset, 'group collapsed during the older load');
  },
};

const searchHistory = heldHistoryApi({ workPages: anchorWorkPages() });

/** A search typed while the older page loads hides rows below the read row (it still matches):
 * the list shrinks under the reader, and the read row must not move when the page lands. */
export const SearchDuringOlderLoad: Story = {
  args: { api: searchHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await workLoadingOlder(canvasElement, searchHistory.older);
    await userEvent.type(within(scroller).getByPlaceholderText('Szukaj w historii pracy'), 'keep');
    await waitFor(() => {
      if (within(scroller).queryByText('Tail search drop-10')) {
        throw new Error('Expected the search to hide the non-matching rows.');
      }
    });
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, READ_ROW);

    searchHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await expectRowStays(scroller, READ_ROW, offset, 'search narrowed during the older load');
  },
};

const hiddenHistory = heldHistoryApi({ workPages: anchorWorkPages() });

/** A search typed while the older page loads hides the row being read itself: the reader is then
 * reading the nearest row the search kept, and that is the row that must stay. */
export const SearchHidesTheReadRow: Story = {
  args: { api: hiddenHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await workLoadingOlder(canvasElement, hiddenHistory.older);
    await userEvent.type(
      within(scroller).getByPlaceholderText('Szukaj w historii pracy'),
      'confirm',
    );
    await waitFor(() => {
      if (within(scroller).queryByText(READ_ROW)) {
        throw new Error('Expected the search to hide the read row.');
      }
    });
    await layoutSettled(scroller);
    const reading = firstVisibleRowTitle(scroller, ['Tail confirm keep-1', 'Tail confirm keep-8']);
    const offset = rowOffset(scroller, reading);

    hiddenHistory.older.release();
    await within(scroller).findByText('Older confirm keep-2');
    await expectRowStays(scroller, reading, offset, 'read row hidden during the older load');
  },
};

const actionsWorkId = 'anchor-actions-work';
const olderActions = ['older-0', 'older-1', 'older-2'].map((name) =>
  toolAction(`Edit · ${name}.ts`),
);
const tailActions = [
  toolAction('Edit · tail-0.ts'),
  toolAction('Edit · late-response.ts', 12),
  toolAction('Edit · tail-2.ts'),
  toolAction('Edit · tail-3.ts'),
];
const actionsHistory = heldHistoryApi({
  workPages: [[workItemWithActions('Edit workspace (7 files)', actionsWorkId, 7)]],
  actionPages: [olderActions, tailActions],
  // The older actions' own contents stay pending: this play checks where the page lands, not what
  // their later growth above the reader does.
  heldContent: new Set([
    tailActions[1]!.output!.contentId,
    ...olderActions.flatMap((action) => [action.input!.contentId, action.output!.contentId]),
  ]),
});

/** On the Actions screen, a tool response under the read action arrives while the older page
 * loads: it grows the list below the reader, and the read action must not move. */
export const ContentArrivesDuringOlderActionsLoad: Story = {
  args: { api: actionsHistory.api },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /Edit workspace \(7 files\)/ }),
    );
    await canvas.findByText('Edit · tail-0.ts');
    await waitFor(() => {
      if (actionsHistory.older.pending() !== 1 || actionsHistory.content.pending() !== 1) {
        throw new Error('Expected the older actions and the late response to be in flight.');
      }
    });
    const scroller = historyScroller(canvasElement);
    await layoutSettled(scroller);

    actionsHistory.content.release();
    await within(scroller).findByText(/late-response\.ts output line 12/);
    await layoutSettled(scroller);
    const offset = rowOffset(scroller, 'Edit · tail-0.ts');

    actionsHistory.older.release();
    await within(scroller).findByText('Edit · older-0.ts');
    await expectRowStays(
      scroller,
      'Edit · tail-0.ts',
      offset,
      'response arrived during the older load',
    );
  },
};
