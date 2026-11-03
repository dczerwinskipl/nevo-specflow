import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import { workSummaryStatesApi } from './managedSession.fullSession.stories-support';
import { genericSpecLevelContext } from './context/sessionContextFixtures';
import { Environment, WIDE_VIEWPORT } from './managedSession.storyHelpers.stories-support';

/**
 * The composed Session screen's Work history -> ToolAction drill on the real `ManagedSession`
 * (secondary-navigation.md "Root tabs and local navigation"; session-work-inspector-ui-spec.md
 * §9.1): Context is already the one tab of the split rail, so opening Work history moves nothing;
 * a ToolAction detail gets the compact back row (`← Wróć do: Historia pracy`), never a breadcrumb
 * trail or a repeat of its own title; the header is title + status line; pretty-printed JSON
 * parameters are numbered while the Read tool's own `cat -n` output is shown verbatim without a
 * second gutter; a failure names itself next to its icon with its message. Mobile keeps its header
 * Back with no row under it. Same title as the other Managed Session groups; hidden `contract`.
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
    owner: 'work-detail-story',
    api: workSummaryStatesApi(),
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

const secondary = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"][data-workspace-active="true"]',
  ) ?? canvasElement.querySelector<HTMLElement>('[data-workspace-surface="secondary"]')!;

function railGeometry(canvasElement: HTMLElement) {
  const region = secondary(canvasElement);
  const rail = region.querySelector<HTMLElement>('[data-workspace-tab-rail]');
  const panel = region.querySelector<HTMLElement>('[role="tabpanel"]');
  if (!rail || !panel) {
    throw new Error('The split Secondary should show its tab rail and tab panel.');
  }

  const railRect = rail.getBoundingClientRect();

  return {
    railTop: railRect.top,
    railHeight: railRect.height,
    contentTop: panel.getBoundingClientRect().top,
  };
}

const tabLabels = (canvasElement: HTMLElement) =>
  [...secondary(canvasElement).querySelectorAll('[role="tab"]')].map(
    (tab) => tab.querySelector('.sr-only')?.textContent,
  );

/** Opens one Turn's Work history from its Work block in the conversation (0-based block index). */
async function openTurnWork(canvasElement: HTMLElement, block: number) {
  await waitFor(() =>
    expect(canvasElement.querySelectorAll('[data-work-block]').length).toBeGreaterThan(block),
  );
  const button = canvasElement.querySelectorAll<HTMLElement>('[data-work-block] button')[block]!;
  await userEvent.click(button);
}

async function openAction(canvasElement: HTMLElement, title: string) {
  const row = await waitFor(() => {
    const match = [...secondary(canvasElement).querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent?.startsWith(title),
    );
    if (!match) {
      throw new Error(`Work history should list "${title}".`);
    }

    return match;
  });
  await userEvent.click(row);
  await waitFor(() =>
    expect(
      within(secondary(canvasElement)).getByRole('heading', { level: 2, name: title }),
    ).toBeVisible(),
  );
}

export const WorkHistoryToolActionDetail: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(1440, 900);
    // Context alone: already the one tab of the rail, with no close anywhere on it.
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst']));
    await expect(
      secondary(canvasElement).querySelector('button[aria-label^="Zamknij"]'),
    ).toBeNull();
    const before = railGeometry(canvasElement);
    await expect(before.railHeight).toBe(32);

    // Opening Work history adds a tab; the rail and the content start do not move.
    await openTurnWork(canvasElement, 2);
    await waitFor(() => expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'Historia pracy']));
    const after = railGeometry(canvasElement);
    await expect(after).toEqual(before);

    // One-level drill: the back row names the parent, never repeats the action's own title.
    await openAction(canvasElement, 'Read file package.json');
    const region = secondary(canvasElement);
    const backRow = region.querySelector<HTMLElement>('[data-workspace-back-row]')!;
    await expect(backRow).not.toBeNull();
    await expect(region.querySelector('[data-workspace-breadcrumbs]')).toBeNull();
    await expect(within(backRow).getByRole('button').textContent).toBe('Wróć do: Historia pracy');
    await expect(backRow.textContent).not.toContain('package.json');
    await expect(backRow.getBoundingClientRect().height).toBe(24);
    await expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'Historia pracy']);
    await expect(
      within(region).getAllByText('Read file package.json', { exact: true }),
    ).toHaveLength(1);

    // Header: success icon (state name for assistive technology), the duration; no clock range.
    const status = region.querySelector<HTMLElement>('[data-tool-action-status]')!;
    await expect(status.querySelector('svg.text-status-success')).not.toBeNull();
    await expect(status.querySelector('.sr-only')?.textContent).toBe('Zakończono');
    const time = status.querySelector('time')!;
    await expect(time.textContent).toBe('200 ms');
    await expect(time.getAttribute('title')).toMatch(/^\d\d:\d\d:\d\d–\d\d:\d\d:\d\d$/);
    await expect(status.textContent).not.toContain('–');

    // JSON parameters numbered; the Read tool's own numbered output verbatim, no second gutter.
    const input = await within(region).findByRole('textbox', { name: 'Parametry' });
    const output = await within(region).findByRole('textbox', { name: 'Odpowiedź narzędzia' });
    await expect(input.closest('.cm-editor')!.querySelector('.cm-lineNumbers')).not.toBeNull();
    await expect(output.closest('.cm-editor')!.querySelector('.cm-gutters')).toBeNull();
    await expect(output.querySelector('.cm-line')!.textContent).toBe(
      "     1\timport { revision } from './revision-cache';",
    );
    await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1);

    // Back returns to the Work history root of the same tab.
    await userEvent.click(within(backRow).getByRole('button'));
    await waitFor(() =>
      expect(secondary(canvasElement).querySelector('[data-workspace-back-row]')).toBeNull(),
    );
    await expect(tabLabels(canvasElement)).toEqual(['Kontekst', 'Historia pracy']);
    await expect(railGeometry(canvasElement)).toEqual(before);
  },
};

export const FailedToolActionDetail: Story = {
  tags: ['contract'],
  globals: WIDE_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(1440, 900);
    await openTurnWork(canvasElement, 1);
    await openAction(canvasElement, 'Bash: pnpm test -- admission-race');
    const region = secondary(canvasElement);
    const status = region.querySelector<HTMLElement>('[data-tool-action-status]')!;
    // Not colour alone: the icon, the state in words, and the readable message below.
    await expect(status.querySelector('svg.text-status-danger')).not.toBeNull();
    await expect(status.textContent).toContain('Niepowodzenie');
    await expect(status.textContent).toContain('8,4 s');
    await expect(within(region).getByText('1 test failed.')).toBeVisible();
    await expect(region.querySelector('svg.text-status-success')).toBeNull();
  },
};

export const ToolActionDetailMobile: Story = {
  tags: ['contract'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    for (const width of [390, 360]) {
      await settleViewport(width, 844);
      await openTurnWork(canvasElement, 2);
      await openAction(canvasElement, 'Read file package.json');
      await settleViewport(width, 844);
      const region = secondary(canvasElement);
      // Mobile: the header's own Back; no back row, breadcrumbs or tab rail under it.
      await expect(region.querySelector('[data-workspace-back-row]')).toBeNull();
      await expect(region.querySelector('[data-workspace-breadcrumbs]')).toBeNull();
      await expect(region.querySelector('[data-workspace-tab-rail]')).toBeNull();
      await expect(region.querySelector('button[aria-label^="Wstecz"]')).not.toBeNull();
      await expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1);
      await userEvent.click(region.querySelector<HTMLElement>('button[aria-label^="Wstecz"]')!);
      await waitFor(() =>
        expect(
          within(secondary(canvasElement)).queryByRole('heading', {
            level: 2,
            name: 'Read file package.json',
          }),
        ).toBeNull(),
      );
      await userEvent.click(
        secondary(canvasElement).querySelector<HTMLElement>('button[aria-label^="Wstecz"]')!,
      );
      await waitFor(() =>
        expect(
          canvasElement.querySelector(
            '[data-workspace-surface="secondary"][data-workspace-active="true"]',
          ),
        ).toBeNull(),
      );
    }
  },
};
