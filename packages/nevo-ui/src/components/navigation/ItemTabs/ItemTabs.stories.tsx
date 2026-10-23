import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceHeader } from '../../../app';
import { ItemTabs } from './ItemTabs';
import { ItemTabsHost, manyItems, sampleItems } from './ItemTabs.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/ItemTabs',
  component: ItemTabs,
  tags: ['autodocs'],
  args: {
    items: sampleItems.slice(0, 3),
    activeId: sampleItems[0]?.id ?? null,
    scope: 'item-tabs-story',
    activation: 'manual',
    variant: 'auto',
    onActivate: () => undefined,
    onClose: () => undefined,
  },
  argTypes: {
    items: {
      control: 'object',
      description:
        'Opened items: `id`, `label`, optional `description` (tooltip and menu), `icon`, `dirty`, `state`.',
      table: { type: { summary: 'readonly ItemTab[]' } },
    },
    activeId: {
      control: 'text',
      description: 'Active item id (controlled), or null.',
      table: { type: { summary: 'string | null' } },
    },
    scope: {
      control: 'text',
      description: 'Id prefix tying tabs to the host-rendered panels.',
      table: { type: { summary: 'string' } },
    },
    activation: {
      control: 'inline-radio',
      options: ['manual', 'automatic'],
      description: 'Manual: arrows move focus, Enter/Space activates. Automatic: focus activates.',
      table: { defaultValue: { summary: 'manual' } },
    },
    variant: {
      control: 'inline-radio',
      options: ['auto', 'strip', 'switcher'],
      description: 'Auto swaps the strip for a switcher button below `switcherBelow` px.',
      table: { defaultValue: { summary: 'auto' } },
    },
    switcherBelow: {
      control: 'number',
      description: 'Container width in px under which `auto` renders the switcher.',
      table: { defaultValue: { summary: '480' } },
    },
    labels: {
      control: 'object',
      description: 'Typed replacement for every generated string (English defaults).',
      table: { type: { summary: 'Partial<ItemTabsLabels>' } },
    },
    onActivate: { control: false, table: { type: { summary: '(id: string) => void' } } },
    onClose: {
      control: false,
      description: 'Called for every close trigger. Pair with `useOpenedItems().requestClose`.',
      table: { type: { summary: '(id: string) => void' } },
    },
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-40 bg-canvas p-4 text-content-primary">
        <div className="max-w-5xl rounded-composite border border-border-subtle bg-surface">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ItemTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: ({ items, activeId, onActivate: _a, onClose: _c, scope: _s, ...props }) => (
    <ItemTabsHost {...props} items={items} activeId={activeId} />
  ),
};

export const States: Story = {
  args: { items: sampleItems, activeId: sampleItems[1]?.id ?? null },
  render: ({ items, activeId, onActivate: _a, onClose: _c, scope: _s, ...props }) => (
    <ItemTabsHost {...props} items={items} activeId={activeId} />
  ),
};

export const Overflow: Story = {
  args: { items: manyItems, activeId: manyItems[9]?.id ?? null },
  render: ({ items, activeId, onActivate: _a, onClose: _c, scope: _s, ...props }) => (
    <ItemTabsHost {...props} items={items} activeId={activeId} />
  ),
};

export const Switcher: Story = {
  args: { items: sampleItems, activeId: sampleItems[1]?.id ?? null, variant: 'switcher' },
  render: ({ items, activeId, onActivate: _a, onClose: _c, scope: _s, ...props }) => (
    <ItemTabsHost {...props} items={items} activeId={activeId} />
  ),
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** The strip hosted in the 56px workspace header slot (`identityContent`). */
export const InWorkspaceHeader: Story = {
  args: { items: sampleItems.slice(0, 4), activeId: sampleItems[1]?.id ?? null },
  render: ({ items, activeId, onActivate: _a, onClose: _c, scope: _s, ...props }) => (
    <ItemTabsHost
      {...props}
      items={items}
      activeId={activeId}
      frame={(tabs, panel) => (
        <>
          <div className="flex h-14 items-center border-b border-border-subtle px-4">
            <div className="min-w-0 flex-1">
              <WorkspaceHeader title="Opened items" identityContent={tabs} />
            </div>
          </div>
          {panel}
        </>
      )}
    />
  ),
};
