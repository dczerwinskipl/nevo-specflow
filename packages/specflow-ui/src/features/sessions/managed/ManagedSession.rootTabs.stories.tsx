import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import {
  workSummaryStatesApi,
  workSummaryStatesSnapshot,
} from './managedSession.fullSession.stories-support';
import { batchContext, genericSpecLevelContext } from './context/sessionContextFixtures';
import {
  Environment,
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
} from './managedSession.storyHelpers.stories-support';

/**
 * Root tab identity on the composed Session screen (full-session-screen-structure.md §7.4.1, §8.3;
 * secondary-navigation.md "Root tabs lifecycle"): a root tab is one OBJECT. Work history is one tab
 * per Turn, whichever entry point opens it (a Work block in the conversation or Context's "Work
 * history" row); every Task is its own tab, labelled by its key; the workspace remembers a tab's
 * scroll while another tab is shown. Same title as the other Managed Session groups; hidden
 * `contract`.
 */

const turnIds = [...new Set(workSummaryStatesSnapshot().entries.map((entry) => entry.turnId))];

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
    owner: 'root-tabs-story',
    api: workSummaryStatesApi(),
    // Context's "Work history" row opens the THIRD Turn: the same Turn as the third Work block.
    sessionContext: { ...genericSpecLevelContext(), activeTurnId: turnIds[2] },
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

const secondary = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"][data-workspace-active="true"]',
  ) ?? canvasElement.querySelector<HTMLElement>('[data-workspace-surface="secondary"]')!;

const tabLabels = (canvasElement: HTMLElement) =>
  [...secondary(canvasElement).querySelectorAll('[role="tab"]')].map(
    (tab) => tab.querySelector('.sr-only')?.textContent,
  );

const selectedTabLabel = (canvasElement: HTMLElement) =>
  secondary(canvasElement).querySelector('[role="tab"][aria-selected="true"] .sr-only')
    ?.textContent;

const workBlockButtons = (canvasElement: HTMLElement) =>
  canvasElement.querySelectorAll<HTMLElement>('[data-work-block] button');

async function selectTab(canvasElement: HTMLElement, label: string) {
  const tab = [...secondary(canvasElement).querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (candidate) => candidate.querySelector('.sr-only')?.textContent === label,
  );
  if (!tab) {
    throw new Error(`The tab strip should show "${label}".`);
  }

  await userEvent.click(tab);
  await waitFor(() => expect(selectedTabLabel(canvasElement)).toBe(label));
}

/** A Context row (a real `<button>`), found by its visible text inside the Secondary. */
async function contextRow(canvasElement: HTMLElement, text: string | RegExp) {
  return waitFor(() => {
    const row = within(secondary(canvasElement)).getByText(text).closest('button');
    if (!row) {
      throw new Error(`The Context row "${text}" should render as a button.`);
    }

    return row;
  });
}

export const WorkHistoryIsOneTabPerTurn: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(1440, 900);
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst']));
    await waitFor(() => expect(workBlockButtons(canvasElement).length).toBeGreaterThan(2));

    // Context's row opens the third Turn's Work history.
    await userEvent.click(await contextRow(canvasElement, /^Historia pracy/));
    const third = 'Historia pracy · tura 3';
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst', third]));

    // The conversation's Work block of the SAME Turn lands on that tab: no second one.
    await userEvent.click(workBlockButtons(canvasElement)[2]!);
    await expect(tabLabels(canvasElement)).toEqual(['Kontekst', third]);
    await expect(selectedTabLabel(canvasElement)).toBe(third);

    // Another Turn opens its own, distinctly labelled tab.
    await userEvent.click(workBlockButtons(canvasElement)[0]!);
    const first = 'Historia pracy · tura 1';
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst', third, first]));
    await expect(selectedTabLabel(canvasElement)).toBe(first);

    // The first Turn's block again activates its tab; nothing is added.
    await userEvent.click(workBlockButtons(canvasElement)[2]!);
    await waitFor(() => expect(selectedTabLabel(canvasElement)).toBe(third));
    await expect(tabLabels(canvasElement)).toEqual(['Kontekst', third, first]);
  },
};

export const TaskTabsArePerTask: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  args: { sessionContext: batchContext() },
  play: async ({ canvasElement }) => {
    await settleViewport(1440, 900);
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst']));

    // Task A from Context: its own tab, showing Task A.
    await userEvent.click(await contextRow(canvasElement, 'Document the admission guard'));
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02']));
    await expect(
      await within(secondary(canvasElement)).findByRole('heading', {
        name: 'Document the admission guard',
      }),
    ).toBeVisible();

    // Task B from Context: a second tab with a distinct label, showing Task B (not Task A).
    await selectTab(canvasElement, 'Kontekst');
    await userEvent.click(await contextRow(canvasElement, 'Deterministic admission'));
    await waitFor(() =>
      expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02', 'TASK-03']),
    );
    await expect(selectedTabLabel(canvasElement)).toBe('TASK-03');
    await expect(
      await within(secondary(canvasElement)).findByRole('heading', {
        name: 'Deterministic admission',
      }),
    ).toBeVisible();

    // Task A again: its existing tab is activated and still shows Task A.
    await selectTab(canvasElement, 'Kontekst');
    await userEvent.click(await contextRow(canvasElement, 'Document the admission guard'));
    await waitFor(() => expect(selectedTabLabel(canvasElement)).toBe('TASK-02'));
    await expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'TASK-02', 'TASK-03']);
    await expect(
      await within(secondary(canvasElement)).findByRole('heading', {
        name: 'Document the admission guard',
      }),
    ).toBeVisible();
  },
};

export const ContextScrollSurvivesSwitchingTabs: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    // A short window, so Context (executor, scope, areas, telemetry) overflows and scrolls.
    await settleViewport(1440, 520);
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst']));
    const viewport = () =>
      secondary(canvasElement).querySelector<HTMLElement>('.scroll-area-viewport')!;
    await waitFor(() =>
      expect(viewport().scrollHeight).toBeGreaterThan(viewport().clientHeight + 200),
    );

    viewport().scrollTop = 200;
    await waitFor(() => expect(viewport().scrollTop).toBeGreaterThanOrEqual(199));
    const scrolled = viewport().scrollTop;
    // Let the workspace record the offset (one frame after the scroll event).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    await userEvent.click(await contextRow(canvasElement, /^Historia pracy/));
    await waitFor(() => expect(tabLabels(canvasElement)).toHaveLength(2));
    await expect(secondary(canvasElement).querySelector('.scroll-area-viewport')).not.toBeNull();

    await selectTab(canvasElement, 'Kontekst');
    await waitFor(() => expect(Math.abs(viewport().scrollTop - scrolled)).toBeLessThanOrEqual(1));
  },
};

/** The visible Secondary surface's heading, or `conversation` while Primary is what is shown. */
const shownSurface = (canvasElement: HTMLElement) => {
  const active = canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"][data-workspace-active="true"]:not([inert])',
  );

  return active
    ? ([...active.querySelectorAll('h1, h2')].find((heading) => !heading.closest('[inert]'))
        ?.textContent ?? 'secondary')
    : 'conversation';
};

/**
 * Narrow layout has no per-object tabs: Back follows the path the user took, and opening an object
 * that was visited before pushes it again (full-session-screen-structure.md §10.3).
 */
export const StackedBackFollowsThePath: Story = {
  tags: ['contract'],
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(390, 844);
    await waitFor(() => expect(shownSurface(canvasElement)).toBe('conversation'));
    const press = async (name: string | RegExp) => {
      // The floating row covers the header once the page scrolled: start from the top.
      canvasElement.querySelector<HTMLElement>('.mobile-workspace-scroll')?.scrollTo({ top: 0 });
      const buttons = await waitFor(() => {
        const found = within(canvasElement)
          .getAllByRole('button', { name })
          .filter((button) => !button.closest('[inert], [aria-hidden="true"]'));
        if (found.length === 0) {
          throw new Error(`No reachable "${String(name)}" button.`);
        }

        return found;
      });
      await userEvent.click(buttons[0]!);
    };

    const expectSurface = (heading: string) =>
      waitFor(() => expect(shownSurface(canvasElement)).toBe(heading));

    await press('Kontekst');
    await expectSurface('Kontekst');
    await press(/2 zadania/);
    await expectSurface('Zadania');
    await press(/Document the admission guard/);
    await expectSurface('Zadanie');
    await press('Wstecz');
    await expectSurface('Zadania');
    // The same Task again pushes again, so Back still returns to the list, then Context, then the
    // conversation: the path, not the object, decides.
    await press(/Document the admission guard/);
    await expectSurface('Zadanie');
    await press('Wstecz');
    await expectSurface('Zadania');
    await press('Wstecz');
    await expectSurface('Kontekst');
    await press('Wstecz');
    await expectSurface('conversation');
  },
};
