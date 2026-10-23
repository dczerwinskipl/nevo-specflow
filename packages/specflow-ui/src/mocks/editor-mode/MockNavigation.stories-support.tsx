import { SideNavigation, type NavigationAdapter, type NavigationNode } from '@nevo/ui';

interface NavTarget {
  href: string;
}
const navigationNodes = [
  {
    key: 'specification',
    label: 'Single sign-on',
    children: [
      { key: 'overview', label: 'Overview', target: { href: '#overview' } },
      { key: 'documents', label: 'Documents', target: { href: '#documents' } },
      { key: 'tasks', label: 'Tasks', target: { href: '#tasks' } },
      { key: 'sessions', label: 'Sessions', target: { href: '#sessions' } },
    ],
  },
] as const satisfies readonly NavigationNode<NavTarget>[];

/** Minimal navigation, only to show the shell frame (persistent at Wide, drawer otherwise). */
export function MockNavigation({ current = 'documents' }: { current?: string }) {
  const adapter: NavigationAdapter<NavTarget> = {
    match: (node) => (node.key === current ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };
  return (
    <div className="px-3 py-4">
      <SideNavigation
        adapter={adapter}
        label="Specification"
        nodes={navigationNodes}
        rootIcons={{ specification: 'folder' }}
      />
    </div>
  );
}
