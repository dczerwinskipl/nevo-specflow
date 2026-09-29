import { useMemo, useState } from 'react';
import type { NavigationAdapter, NavigationNode } from '../NavigationCore';
import { SideNavigation } from './SideNavigation';
import type { SideNavigationRootIcons } from './SideNavigationItem';

export interface NavigationTarget {
  href: string;
}

export const navigationNodes = [
  { key: 'inbox', label: 'Inbox', target: { href: '#inbox' } },
  {
    key: 'users',
    label: 'Users',
    children: [
      { key: 'add-user', label: 'Add user', target: { href: '#add-user' } },
      { key: 'user-list', label: 'List users', target: { href: '#user-list' } },
      {
        key: 'manage-roles',
        label: 'Manage roles and permissions for enterprise workspaces',
        target: { href: '#manage-roles' },
      },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    children: [
      { key: 'customer-list', label: 'Customer directory', target: { href: '#customer-list' } },
      { key: 'segments', label: 'Segments', target: { href: '#segments' } },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    children: [
      { key: 'open-orders', label: 'Open orders', target: { href: '#open-orders' } },
      { key: 'returns', label: 'Returns', target: { href: '#returns' } },
    ],
  },
  { key: 'archive', label: 'Archive', target: { href: '#archive' } },
] as const satisfies readonly NavigationNode<NavigationTarget>[];

export const targetAndChildrenNodes = [
  {
    key: 'projects',
    label: 'Projects',
    target: { href: '#projects' },
    children: [
      { key: 'project-a', label: 'Project Alpha', target: { href: '#project-a' } },
      { key: 'project-b', label: 'Project Beta', target: { href: '#project-b' } },
    ],
  },
] as const satisfies readonly NavigationNode<NavigationTarget>[];

export function navigationAdapter(activeKey: string): NavigationAdapter<NavigationTarget> {
  return {
    match: (node) => (node.key === activeKey ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        data-navigation-content="true"
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };
}

export const rootIcons = {
  inbox: 'inbox',
  users: 'folder',
  customers: 'database',
  orders: 'file',
  archive: 'archive',
} as const satisfies SideNavigationRootIcons;

export const targetAndChildrenIcons = {
  projects: 'folder',
} as const satisfies SideNavigationRootIcons;

export const noActiveAdapter = navigationAdapter('none');
export const activeNestedAdapter = navigationAdapter('user-list');

export function NavigationSurface({
  accessibleLabel = 'Product navigation',
  active = 'none',
  defaultExpandedKeys,
  icons = rootIcons,
  nodes = navigationNodes,
  width = 256,
}: {
  accessibleLabel?: string;
  active?: string;
  defaultExpandedKeys?: readonly string[];
  icons?: SideNavigationRootIcons;
  nodes?: readonly NavigationNode<NavigationTarget>[];
  width?: 240 | 256 | 280;
}) {
  const adapter = useMemo(() => navigationAdapter(active), [active]);
  return (
    <div
      className="rounded-composite border border-border-default bg-surface p-2"
      data-navigation-story-surface="true"
      style={{ width }}
    >
      <SideNavigation
        aria-label={accessibleLabel}
        adapter={adapter}
        defaultExpandedKeys={defaultExpandedKeys}
        label="Workspace"
        nodes={nodes}
        rootIcons={icons}
      />
    </div>
  );
}

export function ControlledExample() {
  const [expandedKeys, setExpandedKeys] = useState<readonly string[]>([]);
  return (
    <div
      className="w-64 rounded-composite border border-border-default bg-surface p-2"
      data-expanded-keys={expandedKeys.join(',')}
    >
      <SideNavigation
        aria-label="Controlled product navigation"
        adapter={noActiveAdapter}
        expandedKeys={expandedKeys}
        label="Workspace"
        nodes={navigationNodes}
        onExpandedKeysChange={setExpandedKeys}
        rootIcons={rootIcons}
      />
    </div>
  );
}
