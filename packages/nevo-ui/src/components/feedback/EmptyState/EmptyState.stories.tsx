import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Nevo UI/Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'One empty screen for every "nothing here yet" area: a large muted glyph (or a custom illustration), a short title, a description on a readable measure and the actions. At most one primary action (the filled `Button`), first; every other action is `variant="secondary"`. `pane` fills an empty area (no border, vertically centred); `default` is an empty block inside a page.',
      },
    },
  },
  args: {
    icon: 'inbox',
    title: 'No customers',
    description: 'Create the first customer to start working with this account.',
  },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

/** An empty block inside a page: bordered, one primary action. */
export const Default: Story = {
  args: { actions: <Button leadingIcon="plus">Create customer</Button> },
};

/**
 * The whole area is empty: borderless, centred in the free height of its host, one primary and one
 * secondary action.
 */
export const Pane: Story = {
  args: {
    variant: 'pane',
    actions: (
      <>
        <Button leadingIcon="plus">Create customer</Button>
        <Button variant="secondary">Import customers</Button>
      </>
    ),
  },
  render: (args) => (
    <div className="flex h-[28rem] flex-col border border-dashed border-border-subtle">
      <EmptyState {...args} />
    </div>
  ),
  play: ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>('[data-empty-state="pane"]')!;
    const host = region.parentElement!.getBoundingClientRect();
    const group = region.firstElementChild!.getBoundingClientRect();
    const actions = region.lastElementChild!.getBoundingClientRect();
    assert(
      Math.abs(group.top - host.top - (host.bottom - actions.bottom)) < 2,
      'The pane centres its content vertically in the host.',
    );
    assert(
      Math.abs(group.left + group.width / 2 - (host.left + host.width / 2)) < 2,
      'The icon is centred horizontally.',
    );
    assert(getComputedStyle(region).borderTopWidth === '0px', 'A pane has no border.');
    const [primary, secondary] = [...region.querySelectorAll('button')];
    assert(primary?.textContent === 'Create customer', 'The primary action comes first.');
    assert(secondary?.textContent === 'Import customers', 'The secondary action follows.');
  },
};

/** A phone-width host: the description wraps on its measure, the actions wrap centred. */
export const PaneNarrow: Story = {
  args: {
    ...Pane.args,
    description:
      'Customers you create or import appear here, with their contracts, their contacts and the open work of every team.',
  },
  render: (args) => (
    <div className="flex h-[32rem] w-[20rem] flex-col border border-dashed border-border-subtle">
      <EmptyState {...args} />
    </div>
  ),
  play: ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>('[data-empty-state="pane"]')!;
    assert(region.scrollWidth <= region.clientWidth, 'Nothing overflows a 320 px host.');
  },
};

/** Only a way out (clear the search): no primary, one secondary action. */
export const Recovery: Story = {
  args: {
    icon: 'search',
    title: 'No matching customers',
    description: 'Type another name or clear the search to see every customer.',
    actions: <Button variant="secondary">Clear search</Button>,
  },
};

function verifyInline(canvasElement: HTMLElement) {
  const state = canvasElement.querySelector<HTMLElement>('[data-empty-state="inline"]');
  assert(state !== null, 'The inline empty state renders.');
  const { borderTopWidth, textAlign } = getComputedStyle(state!);
  assert(borderTopWidth === '0px', 'The inline empty state has no border.');
  assert(textAlign === 'left', 'The inline empty state is aligned to the start.');
  assert(state!.getBoundingClientRect().height < 96, 'The inline empty state is row-sized.');

  return state!;
}

/**
 * The body of a page section without rows (for example a Tasks section with no Tasks): no border,
 * the height and inset of a list row, aligned to the start under the section header. Without a
 * glyph when the section header already shows one; the text starts at the rows' inset.
 */
export const Inline: Story = {
  args: {
    variant: 'inline',
    icon: undefined,
    title: 'No tasks yet',
    description: 'Tasks appear here once the specification is prepared for work.',
  },
  render: (args) => (
    <section className="grid max-w-2xl gap-3">
      <h3 className="text-body-sm font-semibold text-content-primary">Tasks</h3>
      <EmptyState {...args} />
    </section>
  ),
  play: ({ canvasElement }) => {
    const state = verifyInline(canvasElement);
    assert(!state.querySelector('svg'), 'Without an icon no glyph is drawn.');
    const text = state.firstElementChild!.getBoundingClientRect().left;
    assert(text - state.getBoundingClientRect().left === 8, 'The text starts at the row inset.');
  },
};

/** An inline state whose section header has no glyph of its own: a control-sized glyph beside it. */
export const InlineWithGlyph: Story = {
  args: { ...Inline.args, icon: 'list-checks' },
  render: Inline.render,
  play: ({ canvasElement }) => {
    const state = verifyInline(canvasElement);
    assert(state.querySelector('svg') !== null, 'The glyph is drawn beside the text.');
  },
};

/** Without icon and actions: the title and the description alone. */
export const TextOnly: Story = {
  args: { icon: undefined, description: 'Nothing was recorded yet.' },
};
