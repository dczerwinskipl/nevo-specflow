import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea } from '../../layout/ScrollArea';
import { SideNavigation, type SideNavigationProps } from './SideNavigation';
import {
  ControlledExample,
  NavigationSurface,
  navigationNodes,
  noActiveAdapter,
  rootIcons,
  targetAndChildrenIcons,
  targetAndChildrenNodes,
  type NavigationTarget,
} from './SideNavigation.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/SideNavigation',
  component: SideNavigation,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Product navigation',
    adapter: noActiveAdapter,
    nodes: navigationNodes,
    rootIcons,
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A compact two-level renderer for Navigation Core, intended for CRM, dashboard and settings navigation.',
      },
    },
  },
} satisfies Meta<SideNavigationProps<NavigationTarget>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Primary product reference: root links, several groups and one active nested item. */
export const Reference: Story = { render: () => <NavigationSurface active="user-list" /> };

export const ActiveRoot: Story = { render: () => <NavigationSurface active="inbox" /> };

export const ActiveNested: Story = { render: () => <NavigationSurface active="user-list" /> };

export const HoverSibling: Story = {
  render: () => <NavigationSurface active="user-list" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('link', { name: 'Add user' }));
  },
};

export const LongLabels: Story = {
  render: () => <NavigationSurface active="manage-roles" />,
};

export const MultipleGroups: Story = {
  render: () => (
    <NavigationSurface active="user-list" defaultExpandedKeys={['users', 'customers']} />
  ),
};

/** Multiple non-collapsible labels compose independent navigation sections. */
export const MultipleSections: Story = {
  render: () => (
    <div
      className="grid gap-2 rounded-composite border border-border-default bg-surface p-2"
      data-navigation-story-surface="true"
      style={{ width: 256 }}
    >
      <SideNavigation
        adapter={noActiveAdapter}
        label="Workspace"
        nodes={navigationNodes.slice(0, 2)}
        rootIcons={rootIcons}
      />
      <SideNavigation
        adapter={noActiveAdapter}
        label="Administration"
        nodes={navigationNodes.slice(2)}
        rootIcons={rootIcons}
      />
    </div>
  ),
};

export const NarrowWidth: Story = {
  render: () => <NavigationSurface active="manage-roles" width={240} />,
};

export const TargetAndChildren: Story = {
  render: () => (
    <NavigationSurface
      defaultExpandedKeys={['projects']}
      icons={targetAndChildrenIcons}
      nodes={targetAndChildrenNodes}
    />
  ),
};

export const ControlledExpansion: Story = { render: () => <ControlledExample /> };

const longNavigationNodes = Array.from({ length: 18 }, (_, index) => ({
  key: `workspace-${index + 1}`,
  label: `Customer workspace ${index + 1}`,
  target: { href: `#workspace-${index + 1}` },
}));

export const LongScrollableNavigation: Story = {
  render: () => (
    <div className="h-80 w-64 rounded-composite border border-border-default bg-surface p-2">
      <ScrollArea aria-label="Long product navigation" className="h-full" direction="vertical">
        <SideNavigation
          aria-label="Application navigation"
          adapter={noActiveAdapter}
          label="Application workspaces"
          nodes={longNavigationNodes}
        />
      </ScrollArea>
    </div>
  ),
};
