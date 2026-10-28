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
          'One empty screen for every "nothing here yet" area: an icon tile, a short title, a description on a readable measure and the actions. At most one primary action (the filled `Button`), first; every other action is `variant="secondary"`. `pane` fills an empty area (no border, vertically centred); `default` is an empty block inside a page.',
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
  if (!condition) throw new Error(message);
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
      'The icon tile is centred horizontally.',
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

/** Without icon and actions: the title and the description alone. */
export const TextOnly: Story = {
  args: { icon: undefined, description: 'Nothing was recorded yet.' },
};
