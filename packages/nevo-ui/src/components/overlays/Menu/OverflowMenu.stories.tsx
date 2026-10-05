import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverflowMenu } from './OverflowMenu';
import { MenuItem, MenuSeparator } from './Menu';

const meta = {
  title: 'Nevo UI/Overlays/Overflow Menu',
  component: OverflowMenu,
  parameters: { layout: 'fullscreen' },
  args: {
    label: 'RECORD-1234',
    triggerLabel: 'Record actions',
    children: (
      <>
        <MenuItem leadingIcon="file">Open record</MenuItem>
        <MenuSeparator />
        <MenuItem disabled leadingIcon="archive">
          Archive unavailable
        </MenuItem>
      </>
    ),
  },
  render: (args) => (
    <div className="flex min-h-64 justify-end bg-canvas p-4 text-content-primary">
      <OverflowMenu {...args} />
    </div>
  ),
} satisfies Meta<typeof OverflowMenu>;
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

export const Expanding: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Record actions' });
    const anchor = trigger.getBoundingClientRect();
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"][data-side]'),
      'Overflow menu must open and finish positioning.',
    );
    await waitFor(() => {
      const bounds = menu.getBoundingClientRect();
      return Math.abs(bounds.top - anchor.top) < 2 && Math.abs(bounds.right - anchor.right) < 2;
    }, 'Expanded menu must replace the trigger footprint, not sit below the ellipsis.');
    assert(
      getComputedStyle(trigger).opacity === '0',
      'Open menu must not leave a separate ellipsis.',
    );
    assert(
      menu.querySelector('[data-overflow-menu-label]')?.textContent === 'RECORD-1234',
      'Heading must identify the action scope.',
    );
    const label = menu.querySelector<HTMLElement>('[data-overflow-menu-label]')!;
    assert(
      label.nextElementSibling?.getAttribute('role') === 'menuitem',
      'The first action must follow MenuLabel directly, without an extra separator or spacer.',
    );
    assert(
      label.querySelector('[data-typography=section-label]') ??
        label.querySelector('.text-section-label'),
      'Overflow headings must use the shared MenuLabel section typography.',
    );
    assert(
      getComputedStyle(label).textTransform === 'uppercase',
      'Overflow headings must preserve the canonical MenuLabel casing.',
    );
    assert(!menu.querySelector('button'), 'There must be no Close button.');
    assert(
      document.activeElement?.textContent === 'Open record',
      'Keyboard focus must skip the passive heading.',
    );
    const style = getComputedStyle(menu);
    assert(
      style.animationName ===
        (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'overflow-menu-expand'),
      'Reveal must grow from the trigger and respect reduced motion.',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => !document.querySelector('[role="menu"]'), 'Escape must close the menu.');
    assert(document.activeElement === trigger, 'Focus must return to the restored ellipsis.');
    assert(getComputedStyle(trigger).opacity === '1', 'Closed ellipsis must be visible again.');
  },
};

export const LongContext: Story = {
  args: {
    label:
      'Deterministic admission and cross-provider ownership reconciliation for distributed repository workspaces',
  },
};
