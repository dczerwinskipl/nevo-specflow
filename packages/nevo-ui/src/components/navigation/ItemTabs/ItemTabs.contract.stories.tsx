import type { Meta, StoryObj } from '@storybook/react-vite';
import { ItemTabsHost, manyItems, sampleItems } from './ItemTabs.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/ItemTabs',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

const three = sampleItems.slice(0, 3);

export const KeyboardContract: Story = {
  render: () => <ItemTabsHost items={three} activeId={three[0]?.id ?? null} />,
  play: async ({ canvas, userEvent }) => {
    const [first, second, third] = canvas.getAllByRole('tab');
    assert(first && second && third, 'The fixture should render three tabs.');
    assert(first.tabIndex === 0 && second.tabIndex === -1, 'The active tab is the tab stop.');
    assert(
      canvas.getAllByRole('button', { name: /^Close / }).every((button) => button.tabIndex === -1),
      'Close buttons stay out of the tab order.',
    );

    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    assert(document.activeElement === second, 'ArrowRight moves focus.');
    assert(
      first.getAttribute('aria-selected') === 'true',
      'Manual activation: arrows do not activate.',
    );
    await userEvent.keyboard('{Enter}');
    assert(second.getAttribute('aria-selected') === 'true', 'Enter activates the focused tab.');

    await userEvent.keyboard('{End}');
    assert(document.activeElement === third, 'End focuses the last tab.');
    await userEvent.keyboard('{ArrowRight}');
    assert(document.activeElement === first, 'ArrowRight wraps to the first tab.');
    await userEvent.keyboard('{ArrowLeft}');
    assert(document.activeElement === third, 'ArrowLeft wraps to the last tab.');
    await userEvent.keyboard('{Home}');
    assert(document.activeElement === first, 'Home focuses the first tab.');

    const panel = canvas.getByRole('tabpanel');
    assert(second.getAttribute('aria-controls') === panel.id, 'The active tab controls its panel.');
  },
};

export const CloseContract: Story = {
  render: () => <ItemTabsHost items={three} activeId={three[1]?.id ?? null} />,
  play: async ({ canvas, userEvent }) => {
    const second = canvas.getAllByRole('tab')[1];
    assert(second, 'The fixture should render tabs.');
    second.focus();
    await userEvent.keyboard('{Delete}');
    const remaining = await waitFor(
      () => canvas.getAllByRole('tab').length === 2 && canvas.getAllByRole('tab'),
      'Delete closes the focused tab.',
    );
    assert(
      remaining[1]?.getAttribute('aria-selected') === 'true',
      'Closing the active tab activates its right neighbour.',
    );

    const first = remaining[0];
    assert(first, 'Two tabs remain.');
    await userEvent.click(canvas.getByRole('button', { name: `Close ${three[0]?.label}` }));
    await waitFor(() => canvas.getAllByRole('tab').length === 1, 'The x closes a tab.');

    const last = canvas.getAllByRole('tab')[0];
    assert(last, 'One tab remains.');
    last.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    await waitFor(() => canvas.queryAllByRole('tab').length === 0, 'Middle-click closes a tab.');
  },
};

export const GuardedCloseContract: Story = {
  render: () => (
    <ItemTabsHost
      items={three}
      activeId={three[0]?.id ?? null}
      guard={(id) => Promise.resolve(id !== three[0]?.id)}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const [first, second] = three;
    assert(first && second, 'Fixture items.');
    await userEvent.click(canvas.getByRole('button', { name: `Close ${first.label}` }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(canvas.getAllByRole('tab').length === 3, 'A guard that answers false keeps the tab.');
    await userEvent.click(canvas.getByRole('button', { name: `Close ${second.label}` }));
    await waitFor(() => canvas.queryAllByRole('tab').length === 2, 'A guard that agrees closes.');
  },
};

export const OverflowContract: Story = {
  render: () => (
    <div className="w-[760px]">
      <ItemTabsHost items={manyItems} activeId={manyItems[9]?.id ?? null} />
    </div>
  ),
  // The open menu is an overlay layered over page content; axe cannot resolve its background.
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    const tabs = await waitFor(
      () => canvas.getAllByRole('tab').length < manyItems.length && canvas.getAllByRole('tab'),
      'The strip overflows.',
    );
    assert(tabs.length === Math.floor((760 - 52) / 140), 'floor((width - 52) / 140) tabs fit.');
    assert(
      tabs.some((tab) => tab.getAttribute('aria-selected') === 'true'),
      'The active tab is always visible.',
    );
    for (const tab of tabs) {
      const { width } = tab.getBoundingClientRect();
      assert(width >= 140 && width <= 180, `A tab is 140-180 px wide (got ${width}).`);
    }
    await userEvent.click(
      canvas.getByRole('button', { name: `Opened items (${manyItems.length})` }),
    );
    const menu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"]'),
      'The Opened menu opens.',
    );
    assert(
      menu.querySelectorAll('[role="menuitem"]').length === manyItems.length,
      'The menu lists every opened item.',
    );
    assert(
      menu.textContent?.includes('src/audit-log/audit-log.ts') === true,
      'Rows show the full description.',
    );
    await userEvent.keyboard('{Escape}');
  },
};

export const SwitcherContract: Story = {
  render: () => (
    <div className="w-[390px]">
      <ItemTabsHost items={sampleItems} activeId={sampleItems[1]?.id ?? null} />
    </div>
  ),
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    const button = await waitFor(
      () => canvas.queryByRole('button', { name: /sign-in-flow\.md, unsaved changes, 5 opened/ }),
      'Under 480 px the strip is replaced by the switcher.',
    );
    assert(canvas.queryByRole('tablist') === null, 'No tablist remains.');
    await userEvent.click(button);
    const menu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"]'),
      'The switcher opens the Opened menu.',
    );
    assert(
      menu.getBoundingClientRect().right <= window.innerWidth,
      'The menu stays inside the viewport.',
    );
    await userEvent.keyboard('{Escape}');
  },
};
