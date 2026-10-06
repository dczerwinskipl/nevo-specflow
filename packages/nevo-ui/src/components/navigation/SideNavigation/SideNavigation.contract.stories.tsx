import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NavigationNode } from '../NavigationCore';
import { SideNavigation } from './SideNavigation';
import {
  ControlledExample,
  NavigationSurface,
  noActiveAdapter,
  targetAndChildrenIcons,
  targetAndChildrenNodes,
  type NavigationTarget,
} from './SideNavigation.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/SideNavigation',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approximately(actual: number, expected: number, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance;
}

export const InteractionContract: Story = {
  render: () => <ControlledExample />,
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: 'Expand Users' });
    const host = toggle.closest<HTMLElement>('[data-expanded-keys]');
    assert(host, 'The controlled fixture should expose expansion state.');
    await userEvent.click(toggle);
    assert(toggle.getAttribute('aria-expanded') === 'true', 'The branch should expand.');
    assert(
      toggle.getAttribute('aria-label') === 'Collapse Users',
      'The action name should describe collapse.',
    );
    assert(
      host.dataset.expandedKeys === 'users',
      'Controlled state should receive the branch key.',
    );
    await userEvent.click(toggle);
    assert(toggle.getAttribute('aria-expanded') === 'false', 'The branch should collapse.');
  },
};

export const GeometryContract: Story = {
  render: () => <NavigationSurface active="manage-roles" width={240} />,
  play: async ({ canvas }) => {
    const surface = canvas
      .getByText(/Workspace/)
      .closest<HTMLElement>('[data-navigation-story-surface="true"]');
    const nav = surface?.querySelector<HTMLElement>('nav');
    const root = canvas.getByText('Users').closest<HTMLElement>('[data-navigation-depth="1"]');
    const childLabel = canvas.getByText('Manage roles and permissions for enterprise workspaces');
    const child = childLabel.closest<HTMLElement>('[data-navigation-depth="2"]');
    assert(
      surface && nav && root && child,
      'The fixture should expose its surface and both navigation levels.',
    );

    const surfaceRect = surface.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    assert(
      approximately(navRect.left - surfaceRect.left, 9),
      'The consuming surface should provide 8px padding after its 1px border.',
    );
    assert(
      approximately(rootRect.left, navRect.left),
      'Root rows should begin at the navigation content edge.',
    );
    assert(rootRect.height >= 32, 'Root rows should be at least 32px tall.');
    assert(childRect.height > 32, 'A long child label should wrap instead of truncating.');

    const rootContent = root.querySelector<HTMLElement>(':scope > [data-navigation-content]');
    const childContent = child.querySelector<HTMLElement>(':scope > [data-navigation-content]');
    assert(rootContent && childContent, 'Rows should expose measurable content.');
    assert(
      approximately(Number.parseFloat(getComputedStyle(rootContent).paddingLeft), 8),
      'Root content should use 8px horizontal padding.',
    );
    assert(
      approximately(Number.parseFloat(getComputedStyle(childContent).paddingLeft), 8),
      'Child content should use 8px horizontal padding.',
    );

    const group = child.closest<HTMLElement>('[data-navigation-expanded-group="true"]');
    const guide = group?.querySelector<HTMLElement>('[data-navigation-group-guide="true"]');
    const indicator = child.querySelector<HTMLElement>('[data-navigation-active-indicator="true"]');
    const nextRoot = canvas
      .getByText('Customers')
      .closest<HTMLElement>('[data-navigation-depth="1"]');
    assert(
      group && guide && indicator && nextRoot,
      'The expanded branch should expose one bounded guide and active indicator.',
    );
    const groupRect = group.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    assert(
      approximately(guideRect.left - navRect.left, 16),
      'The group rail should sit 16px from navigation content left.',
    );
    assert(
      approximately(childRect.left - navRect.left, 24),
      'Child surfaces should begin 24px from navigation content left.',
    );
    assert(
      approximately(childLabel.getBoundingClientRect().left - navRect.left, 32),
      'Child text should begin 32px from navigation content left.',
    );
    assert(
      approximately(childRect.right, navRect.right),
      'Child rows should use the full remaining navigation width.',
    );
    assert(
      approximately(guideRect.top, groupRect.top) &&
        approximately(guideRect.bottom, groupRect.bottom),
      'One neutral rail should span the entire child group.',
    );
    assert(
      approximately(indicatorRect.left, guideRect.left),
      'The child active marker should exactly overlay the group rail.',
    );
    assert(
      approximately(indicatorRect.top, childRect.top) &&
        approximately(indicatorRect.bottom, childRect.bottom),
      'The active marker should match the interactive child row height.',
    );
    assert(
      approximately(indicatorRect.width, 2),
      'Active state should expose one 2px accent marker.',
    );
    assert(
      approximately(nextRoot.getBoundingClientRect().top - groupRect.bottom, 4),
      'Expanded children should end 4px before the next root row.',
    );
    assert(
      Number.parseInt(getComputedStyle(childLabel).fontWeight, 10) >= 600,
      'Active label should use semibold emphasis.',
    );
  },
};

export const HoverContract: Story = {
  render: () => <NavigationSurface active="user-list" />,
  play: async ({ canvas, userEvent }) => {
    const hovered = canvas
      .getByRole('link', { name: 'Add user' })
      .closest<HTMLElement>('[data-navigation-depth="2"]');
    const active = canvas
      .getByRole('link', { name: 'List users' })
      .closest<HTMLElement>('[data-navigation-depth="2"]');
    assert(hovered && active, 'The fixture should expose hovered and active siblings.');
    await userEvent.hover(hovered);
    assert(
      hovered.querySelector('[data-navigation-active-indicator="true"]') === null,
      'Hover must not render the active accent.',
    );
    assert(
      getComputedStyle(hovered).backgroundColor !== getComputedStyle(active).backgroundColor,
      'Hover and active surfaces should remain visibly distinct.',
    );
  },
};

export const TargetWithChildrenContract: Story = {
  render: () => (
    <NavigationSurface
      defaultExpandedKeys={['projects']}
      icons={targetAndChildrenIcons}
      nodes={targetAndChildrenNodes}
    />
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Projects' });
    const row = link.closest<HTMLElement>('[data-navigation-depth="1"]');
    assert(row, 'The target-and-children row should be rendered.');
    const links = row.querySelectorAll(':scope > a');
    const expansionActions = row.querySelectorAll<HTMLElement>(
      ':scope > [data-navigation-expand-action="true"]',
    );
    assert(links.length === 1, 'The row should contain one navigation link.');
    assert(expansionActions.length === 1, 'The row should contain one expansion action.');
    assert(
      expansionActions[0]!.querySelectorAll('svg').length === 1,
      'The expansion action should contain one icon.',
    );
    assert(
      link.querySelector('[data-navigation-expand-action="true"]') === null,
      'The link should not contain a second expansion affordance.',
    );
  },
};

const deepNavigationNodes = [
  {
    key: 'operations',
    label: 'Operations',
    children: [
      { key: 'regions', label: 'Regions', children: [{ key: 'poland', label: 'Poland' }] },
    ],
  },
] as const satisfies readonly NavigationNode<NavigationTarget>[];

export const DeepTreeDevelopmentFixture: Story = {
  render: () => (
    <div className="w-64 rounded-composite border border-border-default bg-surface p-2">
      <SideNavigation
        aria-label="Deep navigation fixture"
        adapter={noActiveAdapter}
        nodes={deepNavigationNodes}
      />
    </div>
  ),
};
