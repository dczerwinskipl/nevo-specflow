import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  heldHistoryApi,
  historyScroller,
  layoutSettled,
  toolAction,
  workItem,
} from './managedSession.olderPageAnchor.stories-support';
import {
  WorkInspectorEnvironment,
  WorkInspectorHost,
  openWork,
} from './managedSession.workInspectorHost.stories-support';

/**
 * An expanded tool group keeps its open state, and the reader's focus on its trigger, when an
 * older page joins the run it opens (`WorkInspector.tsx`'s stable run and group identity), and
 * when the reader drills into a tool's actions and comes back (the open state is the Turn view's,
 * `workInspectorStore.ts`).
 */
const meta = {
  title: 'SpecFlow/Components/Work Inspector/Tool group identity',
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

const GROUP_MEMBER = 'Group scan member-0.ts';
const OLDER_ROW = 'Older confirm 1';
const DRILL_WORK_ID = 'group-identity-drill-work';

/** An older page, then a tail window that OPENS with a six-tool group (the first run of rows),
 * followed by rows to scroll and a tool with actions to drill into. `olderTools` completed tools
 * at the end of the older page join that group when it lands. */
function groupPages(olderTools: number): WorkSummary[][] {
  const older = [
    workItem('tool', 'Older read 0.ts'),
    workItem('interaction', OLDER_ROW),
    ...Array.from({ length: olderTools }, (_, index) =>
      workItem('tool', `Older scan joining-${index}.ts`),
    ),
  ];
  const tail = [
    ...Array.from({ length: 6 }, (_, index) => workItem('tool', `Group scan member-${index}.ts`)),
    workItem('interaction', 'Tail confirm 0'),
    workItem('tool', 'Edit workspace (2 files)', { workId: DRILL_WORK_ID, actionCount: 2 }),
    ...Array.from({ length: 20 }, (_, index) =>
      index % 2 === 0
        ? workItem('interaction', `Tail confirm ${index + 1}`)
        : workItem('tool', `Tail read ${index}.ts`),
    ),
  ];

  return [older, tail];
}

const groupTrigger = (scroller: HTMLElement) =>
  within(scroller).getByRole('button', { name: /działa\S* narzędzia$/ });

/** Opens Work, waits for the older request the top of the list starts, and expands the group. */
async function expandGroupWhileOlderLoads(
  canvasElement: HTMLElement,
  older: { pending: () => number },
) {
  await openWork(canvasElement);
  const scroller = historyScroller(canvasElement);
  await within(scroller).findByText('Tail confirm 0');
  await waitFor(() => {
    if (older.pending() !== 1) {
      throw new Error('Expected the older Work request to be in flight.');
    }
  });
  await userEvent.click(groupTrigger(scroller));
  await within(scroller).findByText(GROUP_MEMBER);
  await layoutSettled(scroller);

  return scroller;
}

async function expectGroupStillOpen(scroller: HTMLElement, label: string) {
  await layoutSettled(scroller);
  const trigger = groupTrigger(scroller);
  await expect(trigger, `${label}: the group collapsed`).toHaveAttribute('aria-expanded', 'true');
  await expect(within(scroller).getByText(GROUP_MEMBER)).toBeVisible();
  await expect(document.activeElement, `${label}: focus left the group's trigger`).toBe(trigger);
}

const besideHistory = heldHistoryApi({ workPages: groupPages(0) });

/** The older page lands in front of the group's run without joining the group itself. */
export const OlderPageJoinsTheGroupsRun: Story = {
  args: { api: besideHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await expandGroupWhileOlderLoads(canvasElement, besideHistory.older);

    besideHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await expectGroupStillOpen(scroller, 'older page joined the run');
  },
};

const joiningHistory = heldHistoryApi({ workPages: groupPages(2) });

/** The older page ends with completed tools that join the group itself: it grows to eight. */
export const OlderPageJoinsTheGroup: Story = {
  args: { api: joiningHistory.api },
  play: async ({ canvasElement }) => {
    const scroller = await expandGroupWhileOlderLoads(canvasElement, joiningHistory.older);

    joiningHistory.older.release();
    await within(scroller).findByRole('button', { name: '8 działań narzędzia' });
    await expectGroupStillOpen(scroller, 'older tools joined the group');
    await expect(within(scroller).getByText('Older scan joining-0.ts')).toBeVisible();
  },
};

const drillHistory = heldHistoryApi({
  workPages: groupPages(0),
  actionPages: [[toolAction('Edit · drill-0.ts'), toolAction('Edit · drill-1.ts')]],
});

/** Drilling into a tool's actions and coming back finds the group as the reader left it. */
export const GroupStaysOpenAfterDrillIn: Story = {
  args: { api: drillHistory.api },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    const scroller = historyScroller(canvasElement);
    await waitFor(() => {
      if (drillHistory.older.pending() !== 1) {
        throw new Error('Expected the older Work request to be in flight.');
      }
    });
    drillHistory.older.release();
    await within(scroller).findByText(OLDER_ROW);
    await userEvent.click(groupTrigger(scroller));
    await within(scroller).findByText(GROUP_MEMBER);

    await userEvent.click(canvas.getByRole('button', { name: /Edit workspace \(2 files\)/ }));
    await canvas.findByText('Edit · drill-0.ts');
    await userEvent.click(canvas.getByRole('button', { name: /^(Wstecz|Back)/ }));

    const back = historyScroller(canvasElement);
    await within(back).findByText('Tail confirm 0');
    await layoutSettled(back);
    await expect(groupTrigger(back)).toHaveAttribute('aria-expanded', 'true');
    await expect(within(back).getByText(GROUP_MEMBER)).toBeVisible();
  },
};
