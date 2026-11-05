import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { createGate } from './managedSession.olderPageAnchor.stories-support';
import { createWorkInspectorFixtureApi } from './managedSession.workInspector.stories-support';
import {
  WorkInspectorEnvironment,
  WorkInspectorHost,
  openWork,
} from './managedSession.workInspectorHost.stories-support';

/**
 * Auto-loading older Work pages is bounded (`useAutoLoadOlder`): when pages keep adding nothing to
 * what the list shows, it stops after three and leaves the next batch to the reader's button.
 */
const meta = {
  title: 'SpecFlow/Components/Work Inspector/Bounded older load',
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

/** A Commentary and a tool per entry pair, two items per page: twenty pages behind the tail. */
const history: WorkSummary[] = Array.from({ length: 40 }, (_, index) => ({
  workId: `bounded-work-${index}`,
  ordinal: index + 1,
  revision: 1,
  state: 'completed',
  kind: index % 2 === 0 ? 'commentary' : 'tool',
  title: { text: `Wpis ${index}`, complete: true },
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
}));

function countedApi() {
  const base = createWorkInspectorFixtureApi(history, {}, 2);
  const cursors: (string | undefined)[] = [];
  // The first older page waits for the play to have typed its search, so every page counted is
  // read with the search active.
  const firstOlder = createGate();
  let held = false;
  const api: ManagedSessionsApi = {
    ...base,
    work: async (sessionId, turnId, before, signal) => {
      cursors.push(before);
      if (before !== undefined && !held) {
        held = true;
        await firstOlder.wait();
      }

      return base.work(sessionId, turnId, before, signal);
    },
  };

  return {
    api,
    release: () => firstOlder.release(),
    olderRequests: () => cursors.filter((before) => before !== undefined).length,
  };
}

const searching = countedApi();

/** A search with no match in the loaded part: three older pages are read, then the list stops with
 * a button that says what it does, and the empty state does not claim there is nothing. */
export const SearchStopsAfterThreePages: Story = {
  args: { api: searching.api },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await userEvent.type(await canvas.findByPlaceholderText('Szukaj w historii pracy'), 'zzz');
    searching.release();

    const button = await canvas.findByRole('button', { name: 'Szukaj w starszej historii' });
    await expect(canvas.getByText('Brak wyników we wczytanych wpisach.')).toBeVisible();
    await expect(canvas.queryByText('Żadna pozycja nie odpowiada tym filtrom.')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(searching.olderRequests()).toBe(3);

    const before = searching.olderRequests();
    await userEvent.click(button);
    await waitFor(() => expect(searching.olderRequests()).toBeGreaterThan(before));
    await canvas.findByRole('button', { name: 'Szukaj w starszej historii' });
  },
};
