import {
  SideNavigation,
  Typography,
  type NavigationAdapter,
  type NavigationNode,
} from '../../components';
import { AppContent, AppWorkspace, AppWorkspaceBody } from '../workspace/AppWorkspace';

interface NavigationTarget {
  href: string;
}

const navigationNodes = [
  {
    key: 'customer-operations',
    label: 'Customer operations',
    children: [
      { key: 'overview', label: 'Overview', target: { href: '#overview' } },
      { key: 'customers', label: 'Customers', target: { href: '#customers' } },
    ],
  },
  { key: 'reports', label: 'Reports', target: { href: '#reports' } },
] as const satisfies readonly NavigationNode<NavigationTarget>[];

const navigationAdapter: NavigationAdapter<NavigationTarget> = {
  match: (node) => (node.key === 'overview' ? 'active' : 'none'),
  renderLink: ({ children, className, isActive, node }) => (
    <a aria-current={isActive ? 'page' : undefined} className={className} href={node.target?.href}>
      {children}
    </a>
  ),
};

/** Shared by the public Playground and the canonical Figma capture. */
export function AppShellNavigationFixture() {
  return (
    <div className="px-3 py-4">
      <SideNavigation
        adapter={navigationAdapter}
        label="Workspace"
        nodes={navigationNodes}
        rootIcons={{ 'customer-operations': 'folder', reports: 'database' }}
      />
    </div>
  );
}

/** Shared by the public Playground and the canonical Figma capture. */
export function AppShellWorkspaceFixture() {
  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary
        header={
          <Typography as="h1" variant="title-sm">
            Customer overview
          </Typography>
        }
      >
        <AppContent className="w-content-wide max-w-full">
          <AppWorkspaceBody>
            <Typography className="text-content-muted" variant="body-sm">
              Main application workspace
            </Typography>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>

      <AppWorkspace.Secondary
        header={
          <Typography as="h2" variant="title-sm">
            Details
          </Typography>
        }
      >
        <AppContent className="w-content-narrow max-w-full">
          <AppWorkspaceBody>
            <Typography className="text-content-muted" variant="body-sm">
              Contextual secondary panel
            </Typography>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}
